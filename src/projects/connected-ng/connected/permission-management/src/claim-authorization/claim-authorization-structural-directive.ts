import {
	Directive,
	EmbeddedViewRef,
	OnDestroy,
	TemplateRef,
	ViewContainerRef,
	afterEveryRender,
	effect,
	inject,
	input,
} from '@angular/core';
import { ClaimStorageService } from '@connected-ng/core/authentication';

export interface ClaimRequirement {
	value: string;
	schema?: string;
	entity?: string;
	entityId?: string;
}

const LOCKED_CLASSES = ['claim-locked', 'disabled', 'read-only'];
const NATIVE_CONTROLS = 'button, input, select, textarea';

type NativeControl = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/*
 * What locking changed on a root node, so unlocking reverts exactly that and leaves the state the application set
 * itself (its own classes, controls it disabled, an inert it set) alone.
 */
interface LockedNode {
	addedClasses: string[];
	disabledControls: NativeControl[];
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

	private embeddedView: EmbeddedViewRef<unknown> | null = null;
	private wasLocked: boolean | null = null;
	private locked = false;
	private readonly lockedNodes = new Map<HTMLElement, LockedNode>();

	constructor() {
		effect(() => {
			const requirements = this.claimAuthorization();
			const additionalChecks = this.claimAuthorizationAdditionalChecks();
			const unlocked =
				requirements.every(r => this.claimStorage.hasClaim(r.value, r.schema, r.entity, r.entityId)) &&
				additionalChecks.every(fn => fn());

			this.apply(unlocked);
		});

		// Root nodes rendered after the lock was applied, such as control flow at the root of the template, are locked too.
		afterEveryRender(() => {
			if (this.locked)
				this.lockRootNodes();
		});
	}

	ngOnDestroy(): void {
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
			this.locked = false;
			this.lockedNodes.clear();

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

			this.locked = isLocked;

			if (isLocked)
				this.lockRootNodes();
			else
				this.unlockRootNodes();
		}

		if (stateChanged) {
			if (unlocked) this.claimAuthorizationUnlockHandler()?.();
			else this.claimAuthorizationLockHandler()?.();
		}
	}

	private lockRootNodes(): void {
		if (!this.embeddedView) return;

		for (const node of this.embeddedView.rootNodes as Node[]) {
			if (node instanceof HTMLElement && !this.lockedNodes.has(node))
				this.lockedNodes.set(node, this.lockNode(node));
		}
	}

	/*
	 * The classes give the locked look. inert is what actually locks the content: CSS pointer-events can be switched
	 * back on by descendants (Material list item lines do) and do not stop the keyboard, while inert blocks every
	 * pointer and keyboard interaction and takes the whole subtree out of the tab order. Native controls are disabled as
	 * well so they look disabled.
	 */
	private lockNode(node: HTMLElement): LockedNode {
		const addedClasses = LOCKED_CLASSES.filter(c => !node.classList.contains(c));
		node.classList.add(...addedClasses);

		const disabledControls = [node, ...Array.from(node.querySelectorAll<HTMLElement>(NATIVE_CONTROLS))]
			.filter((el): el is NativeControl => el.matches(NATIVE_CONTROLS) && !(el as NativeControl).disabled);
		disabledControls.forEach(el => el.disabled = true);

		const wasInert = node.inert;
		node.inert = true;

		return { addedClasses, disabledControls, wasInert };
	}

	private unlockRootNodes(): void {
		for (const [node, locked] of this.lockedNodes) {
			node.classList.remove(...locked.addedClasses);
			locked.disabledControls.forEach(el => el.disabled = false);
			node.inert = locked.wasInert;
		}

		this.lockedNodes.clear();
	}
}
