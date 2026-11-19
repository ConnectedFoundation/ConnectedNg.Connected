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
const NATIVE_CONTROLS = 'button, input, select, textarea';

type NativeControl = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/*
 * The lock of one element, shared by every directive that locks it: a directive at the root of another one locks the
 * same elements. The first lock records the element's own state and only the last release restores it.
 */
interface ElementLock {
	holders: number;
	addedClass: boolean;
	wasInert: boolean;
	disabledControls: NativeControl[];
}

const elementLocks = new WeakMap<HTMLElement, ElementLock>();

function acquireLock(element: HTMLElement): void {
	let lock = elementLocks.get(element);

	if (!lock) {
		lock = {
			holders: 0,
			addedClass: !element.classList.contains(LOCKED_CLASS),
			wasInert: element.inert,
			disabledControls: [],
		};
		elementLocks.set(element, lock);
	}

	lock.holders++;
	enforceLock(element, lock);
}

/*
 * inert blocks every pointer and keyboard interaction and takes the whole subtree out of the tab order, also for
 * descendants that switch pointer events back on (Material list item lines do). It is applied again on every render
 * because another writer (an [inert] binding) could clear it. Native controls are disabled as well, because inert does
 * not keep a submit button out of implicit form submission or named fields out of a native form post. The class only
 * gives the locked look.
 */
function enforceLock(element: HTMLElement, lock: ElementLock): void {
	if (lock.addedClass)
		element.classList.add(LOCKED_CLASS);

	element.inert = true;

	for (const control of nativeControls(element)) {
		if (!control.disabled) {
			control.disabled = true;
			lock.disabledControls.push(control);
		}
	}
}

function releaseLock(element: HTMLElement): void {
	const lock = elementLocks.get(element);

	if (!lock || --lock.holders > 0)
		return;

	elementLocks.delete(element);

	if (lock.addedClass)
		element.classList.remove(LOCKED_CLASS);

	element.inert = lock.wasInert;
	// Only the controls the lock disabled; a control the application disabled before the lock stays disabled.
	lock.disabledControls.forEach(control => control.disabled = false);
}

function nativeControls(element: HTMLElement): NativeControl[] {
	return [element, ...Array.from(element.querySelectorAll<HTMLElement>(NATIVE_CONTROLS))]
		.filter((el): el is NativeControl => el.matches(NATIVE_CONTROLS));
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
	// The root elements this directive holds a lock on.
	private readonly heldElements = new Set<HTMLElement>();
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
		// Released so a directive around this one, which may lock the same elements, is not kept from unlocking them.
		this.unlock();
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

	private lock(): void {
		this.syncLocks();

		// Root nodes rendered after locking, such as control flow at the root of the template, are locked too. Registered
		// outside the reactive context of the claims effect, which Angular requires for render hooks.
		this.renderHook ??= untracked(() => afterEveryRender(() => this.syncLocks(), { injector: this.injector }));
	}

	/*
	 * Locks the current root elements and releases the ones that are no longer roots of the view. Compared with the
	 * view's root nodes, not with the document: a root that is detached and attached again (a cached view) keeps its lock
	 * and still gets its own state back on unlock.
	 */
	private syncLocks(): void {
		if (!this.embeddedView) return;

		const roots = new Set(
			(this.embeddedView.rootNodes as Node[]).filter((node): node is HTMLElement => node instanceof HTMLElement)
		);

		for (const element of this.heldElements) {
			if (!roots.has(element)) {
				releaseLock(element);
				this.heldElements.delete(element);
			}
		}

		for (const element of roots) {
			if (this.heldElements.has(element)) {
				enforceLock(element, elementLocks.get(element)!);
			} else {
				acquireLock(element);
				this.heldElements.add(element);
			}
		}
	}

	private unlock(): void {
		this.renderHook?.destroy();
		this.renderHook = null;

		this.heldElements.forEach(releaseLock);
		this.heldElements.clear();
	}
}
