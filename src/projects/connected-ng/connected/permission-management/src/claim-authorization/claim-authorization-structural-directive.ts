import {
	AfterRenderRef,
	Directive,
	EmbeddedViewRef,
	Injector,
	OnDestroy,
	TemplateRef,
	ViewContainerRef,
	afterEveryRender,
	effect,
	inject,
	input,
	untracked,
} from '@angular/core';
import { ClaimStorageService } from '@connected-ng/core/authentication';

export interface ClaimRequirement {
	value: string;
	schema?: string;
	entity?: string;
	entityId?: string;
}

const LOCKED_CLASS = 'claim-locked';

/*
 * What locking changed on a root node, so unlocking reverts exactly that: the class only when the node did not have
 * it, and inert back to the value it had.
 */
interface LockedNode {
	addedClass: boolean;
	wasInert: boolean;
}

@Directive({
	selector: 'ng-template[claimAuthorization]',
	standalone: true,
})
export class ClaimAuthorizationStructuralDirective implements OnDestroy {
	claimAuthorization = input.required<ClaimRequirement[]>();
	claimAuthorizationMode = input<'hide' | 'disable'>('hide');
	claimAuthorizationAdditionalChecks = input<Array<() => boolean>>([]);
	claimAuthorizationUnlockHandler = input<(() => void) | undefined>(undefined);
	claimAuthorizationLockHandler = input<(() => void) | undefined>(undefined);

	private readonly claimStorage = inject(ClaimStorageService);
	private readonly tpl = inject(TemplateRef<unknown>);
	private readonly vcr = inject(ViewContainerRef);
	private readonly injector = inject(Injector);

	private embeddedView: EmbeddedViewRef<unknown> | null = null;
	private wasLocked: boolean | null = null;
	private readonly lockedNodes = new Map<HTMLElement, LockedNode>();
	private renderHook: AfterRenderRef | null = null;

	constructor() {
		effect(() => {
			const requirements = this.claimAuthorization();
			const additionalChecks = this.claimAuthorizationAdditionalChecks();
			const unlocked =
				requirements.every(r => this.claimStorage.hasClaim(r.value, r.schema, r.entity, r.entityId)) &&
				additionalChecks.every(fn => fn());

			this.apply(unlocked);
		});
	}

	ngOnDestroy(): void {
		this.stopRenderHook();
		this.lockedNodes.clear();
		this.vcr.clear();
		this.embeddedView = null;
	}

	private apply(unlocked: boolean): void {
		const mode = this.claimAuthorizationMode();
		const isLocked = !unlocked;
		const stateChanged = this.wasLocked !== isLocked;
		this.wasLocked = isLocked;

		if (mode === 'hide') {
			// Coming from disable mode, a kept view must not stay locked.
			this.unlock();

			if (unlocked && !this.embeddedView) {
				this.embeddedView = this.vcr.createEmbeddedView(this.tpl);
				this.embeddedView.detectChanges();
			} else if (!unlocked && this.embeddedView) {
				this.vcr.clear();
				this.embeddedView = null;
			}
		} else {
			if (!this.embeddedView) {
				this.embeddedView = this.vcr.createEmbeddedView(this.tpl);
				this.embeddedView.detectChanges();
			}

			if (isLocked)
				this.lock();
			else
				this.unlock();
		}

		if (stateChanged) {
			if (unlocked) this.claimAuthorizationUnlockHandler()?.();
			else this.claimAuthorizationLockHandler()?.();
		}
	}

	/*
	 * inert blocks every pointer and keyboard interaction and takes the whole subtree out of the tab order, also for
	 * descendants that switch pointer events back on (Material list item lines do) and for descendants rendered later.
	 * The class only gives the locked look; the directive writes nothing else, so bindings and forms keep their state.
	 */
	private lock(): void {
		this.lockRootNodes();

		// Root nodes rendered after locking, such as control flow at the root of the template, are locked too.
		// Registered outside the reactive context of the claims effect, which Angular requires for render hooks.
		this.renderHook ??= untracked(() => afterEveryRender(() => this.lockRootNodes(), { injector: this.injector }));
	}

	private lockRootNodes(): void {
		if (!this.embeddedView) return;

		// Root nodes that control flow removed are no longer kept.
		for (const node of this.lockedNodes.keys()) {
			if (!node.isConnected)
				this.lockedNodes.delete(node);
		}

		for (const node of this.embeddedView.rootNodes as Node[]) {
			if (!(node instanceof HTMLElement) || this.lockedNodes.has(node)) continue;

			const addedClass = !node.classList.contains(LOCKED_CLASS);
			if (addedClass) node.classList.add(LOCKED_CLASS);

			this.lockedNodes.set(node, { addedClass, wasInert: node.inert });
			node.inert = true;
		}
	}

	private unlock(): void {
		this.stopRenderHook();

		for (const [node, locked] of this.lockedNodes) {
			if (locked.addedClass) node.classList.remove(LOCKED_CLASS);
			node.inert = locked.wasInert;
		}

		this.lockedNodes.clear();
	}

	private stopRenderHook(): void {
		this.renderHook?.destroy();
		this.renderHook = null;
	}
}
