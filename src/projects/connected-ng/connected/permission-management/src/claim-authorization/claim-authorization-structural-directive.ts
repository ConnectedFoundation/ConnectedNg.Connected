import {
	Directive,
	EmbeddedViewRef,
	OnDestroy,
	TemplateRef,
	ViewContainerRef,
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
		this.vcr.clear();
		this.embeddedView = null;
	}

	private apply(unlocked: boolean): void {
		const mode = this.claimAuthorizationMode();
		const isLocked = !unlocked;
		const stateChanged = this.wasLocked !== isLocked;
		this.wasLocked = isLocked;

		if (mode === 'hide') {
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
			this.setDisabled(isLocked);
		}

		if (stateChanged) {
			if (unlocked) this.claimAuthorizationUnlockHandler()?.();
			else this.claimAuthorizationLockHandler()?.();
		}
	}

	private setDisabled(disabled: boolean): void {
		if (!this.embeddedView) return;
		(this.embeddedView.rootNodes as HTMLElement[]).forEach(node => this.applyDisabledToNode(node, disabled));
	}

	private applyDisabledToNode(node: HTMLElement, disabled: boolean): void {
		if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

		node.classList.toggle('claim-locked', disabled);
		node.classList.toggle('disabled', disabled);
		node.classList.toggle('read-only', disabled);

		const interactive = 'button, input, select, textarea';
		if (node.matches?.(interactive)) (node as HTMLInputElement).disabled = disabled;
		node.querySelectorAll?.<HTMLInputElement>(interactive).forEach(el => el.disabled = disabled);
	}
}
