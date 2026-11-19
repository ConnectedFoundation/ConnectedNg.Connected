import { Component, Injectable, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClaimStorageService } from '@connected-ng/core/authentication';
import { ClaimAuthorizationStructuralDirective, ClaimRequirement } from './claim-authorization-structural-directive';

const CLAIM = 'Test Claim';

@Injectable()
class FakeClaimStorage {
	readonly claims = signal<string[]>([]);

	hasClaim(value: string): boolean {
		return this.claims().includes(value);
	}
}

@Component({
	imports: [ClaimAuthorizationStructuralDirective],
	template: `
		<div
			*claimAuthorization="requirements; mode: mode(); additionalChecks: checks(); unlockHandler: onUnlock; lockHandler: onLock"
			id="root"
			class="own"
		>
			<button id="button">Save</button>
			<textarea id="textarea"></textarea>
			<button id="app-disabled" disabled>Already disabled</button>
		</div>
	`,
})
class HostComponent {
	readonly requirements: ClaimRequirement[] = [{ value: CLAIM }];
	readonly mode = signal<'hide' | 'disable'>('disable');
	readonly checks = signal<Array<() => boolean>>([]);
	unlocks = 0;
	locks = 0;
	readonly onUnlock = () => this.unlocks++;
	readonly onLock = () => this.locks++;
}

@Component({
	imports: [ClaimAuthorizationStructuralDirective],
	template: `
		<ng-template [claimAuthorization]="requirements" claimAuthorizationMode="disable">
			@if (showLate()) {
				<button id="late">Late</button>
			}
		</ng-template>
	`,
})
class LateRootHostComponent {
	readonly requirements: ClaimRequirement[] = [{ value: CLAIM }];
	readonly showLate = signal(false);
}

const OUTER = 'Outer Claim';
const INNER = 'Inner Claim';

@Component({
	imports: [ClaimAuthorizationStructuralDirective],
	template: `
		<ng-container *claimAuthorization="outer; mode: 'disable'">
			<button *claimAuthorization="inner; mode: 'disable'" id="nested">Save</button>
		</ng-container>
	`,
})
class NestedHostComponent {
	readonly outer: ClaimRequirement[] = [{ value: OUTER }];
	readonly inner: ClaimRequirement[] = [{ value: INNER }];
}

@Component({
	imports: [ClaimAuthorizationStructuralDirective],
	template: `
		<div *claimAuthorization="requirements; mode: 'disable'" id="bound" [inert]="appInert()"></div>
	`,
})
class InertBindingHostComponent {
	readonly requirements: ClaimRequirement[] = [{ value: CLAIM }];
	readonly appInert = signal(false);
}

@Component({
	imports: [ClaimAuthorizationStructuralDirective],
	template: `
		<form id="form">
			<input id="query" name="query">
			<button *claimAuthorization="requirements; mode: 'disable'" id="submit" type="submit">Save</button>
		</form>
	`,
})
class FormHostComponent {
	readonly requirements: ClaimRequirement[] = [{ value: CLAIM }];
}

describe('ClaimAuthorizationStructuralDirective', () => {
	let claims: FakeClaimStorage;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [{ provide: ClaimStorageService, useClass: FakeClaimStorage }],
		});

		claims = TestBed.inject(ClaimStorageService) as unknown as FakeClaimStorage;
	});

	// Runs the effects, change detection and the render hooks.
	async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
		fixture.detectChanges();
		TestBed.tick();
		await fixture.whenStable();
	}

	function query<T extends HTMLElement = HTMLElement>(fixture: ComponentFixture<unknown>, id: string): T | null {
		return (fixture.nativeElement as HTMLElement).querySelector<T>(`#${id}`);
	}

	async function create(granted: boolean, mode: 'hide' | 'disable' = 'disable'): Promise<ComponentFixture<HostComponent>> {
		claims.claims.set(granted ? [CLAIM] : []);

		const fixture = TestBed.createComponent(HostComponent);
		fixture.componentInstance.mode.set(mode);
		await settle(fixture);

		return fixture;
	}

	describe('hide mode', () => {
		it('renders the content when the claim is granted', async () => {
			const fixture = await create(true, 'hide');

			expect(query(fixture, 'root')).not.toBeNull();
		});

		it('does not render the content without the claim', async () => {
			const fixture = await create(false, 'hide');

			expect(query(fixture, 'root')).toBeNull();
		});

		it('follows claim changes', async () => {
			const fixture = await create(false, 'hide');

			claims.claims.set([CLAIM]);
			await settle(fixture);
			expect(query(fixture, 'root')).not.toBeNull();

			claims.claims.set([]);
			await settle(fixture);
			expect(query(fixture, 'root')).toBeNull();
		});
	});

	describe('disable mode', () => {
		it('leaves granted content untouched', async () => {
			const fixture = await create(true);
			const root = query(fixture, 'root')!;

			expect(root.inert).toBeFalse();
			expect(root.className.trim()).toBe('own');
			expect(query<HTMLButtonElement>(fixture, 'button')!.disabled).toBeFalse();
			expect(query<HTMLTextAreaElement>(fixture, 'textarea')!.disabled).toBeFalse();
		});

		it('renders locked content inert with the locked class and disabled native controls', async () => {
			const fixture = await create(false);
			const root = query(fixture, 'root')!;

			expect(root.inert).toBeTrue();
			expect(root.className.split(' ').sort()).toEqual(['claim-locked', 'own']);
			expect(query<HTMLButtonElement>(fixture, 'button')!.disabled).toBeTrue();
			expect(query<HTMLTextAreaElement>(fixture, 'textarea')!.disabled).toBeTrue();
		});

		it('keeps locked content out of focus', async () => {
			const fixture = await create(false);
			const textarea = query<HTMLTextAreaElement>(fixture, 'textarea')!;

			textarea.focus();

			expect(document.activeElement).not.toBe(textarea);
		});

		it('reverts the lock when the claim is granted', async () => {
			const fixture = await create(false);

			claims.claims.set([CLAIM]);
			await settle(fixture);

			const root = query(fixture, 'root')!;
			expect(root.inert).toBeFalse();
			expect(root.className.trim()).toBe('own');
			expect(query<HTMLButtonElement>(fixture, 'button')!.disabled).toBeFalse();
			expect(query<HTMLTextAreaElement>(fixture, 'textarea')!.disabled).toBeFalse();
		});

		it('keeps the classes and disabled controls the application set before locking', async () => {
			const fixture = await create(true);
			const root = query(fixture, 'root')!;
			root.classList.add('read-only');

			claims.claims.set([]);
			await settle(fixture);
			claims.claims.set([CLAIM]);
			await settle(fixture);

			expect(root.classList).toContain('read-only');
			expect(root.classList).not.toContain('claim-locked');
			expect(query<HTMLButtonElement>(fixture, 'app-disabled')!.disabled).toBeTrue();
		});

		it('keeps the classes the application set while locked', async () => {
			const fixture = await create(false);
			const root = query(fixture, 'root')!;
			root.classList.add('read-only');

			claims.claims.set([CLAIM]);
			await settle(fixture);

			expect(root.classList).toContain('read-only');
		});

		it('locks again when an inert binding clears inert while locked', async () => {
			claims.claims.set([]);
			const fixture = TestBed.createComponent(InertBindingHostComponent);
			await settle(fixture);
			const bound = query(fixture, 'bound')!;

			fixture.componentInstance.appInert.set(true);
			await settle(fixture);
			fixture.componentInstance.appInert.set(false);
			await settle(fixture);

			expect(bound.inert).toBeTrue();
		});

		it('unlocks a root that was detached and attached again while locked', async () => {
			const fixture = await create(false);
			const root = query(fixture, 'root')!;
			const parent = root.parentNode!;
			const next = root.nextSibling;

			// A render while the root is detached, as when a cached view is out of the document.
			root.remove();
			fixture.componentInstance.checks.set([]);
			await settle(fixture);
			parent.insertBefore(root, next);
			await settle(fixture);

			claims.claims.set([CLAIM]);
			await settle(fixture);

			expect(root.inert).toBeFalse();
			expect(root.classList).not.toContain('claim-locked');
			expect(query<HTMLButtonElement>(fixture, 'button')!.disabled).toBeFalse();
		});

		it('keeps nested content locked until both locks are released', async () => {
			claims.claims.set([]);
			const fixture = TestBed.createComponent(NestedHostComponent);
			await settle(fixture);
			const button = query<HTMLButtonElement>(fixture, 'nested')!;
			expect(button.inert).toBeTrue();

			claims.claims.set([OUTER]);
			await settle(fixture);
			expect(button.inert).toBeTrue();
			expect(button.disabled).toBeTrue();
			expect(button.classList).toContain('claim-locked');

			claims.claims.set([OUTER, INNER]);
			await settle(fixture);
			expect(button.inert).toBeFalse();
			expect(button.disabled).toBeFalse();
			expect(button.classList).not.toContain('claim-locked');
		});

		it('disables a locked submit button, so implicit form submission cannot use it', async () => {
			claims.claims.set([]);
			const fixture = TestBed.createComponent(FormHostComponent);
			await settle(fixture);
			const submit = query<HTMLButtonElement>(fixture, 'submit')!;

			// A disabled default button makes implicit submission (Enter in a field) do nothing.
			expect(submit.disabled).toBeTrue();

			claims.claims.set([CLAIM]);
			await settle(fixture);

			expect(submit.disabled).toBeFalse();
		});

		it('keeps a locked class the application set itself', async () => {
			const fixture = await create(true);
			const root = query(fixture, 'root')!;
			root.classList.add('claim-locked');

			claims.claims.set([]);
			await settle(fixture);
			claims.claims.set([CLAIM]);
			await settle(fixture);

			expect(root.classList).toContain('claim-locked');
		});

		it('unlocks a kept view when the mode switches to hide', async () => {
			const fixture = await create(false);

			claims.claims.set([CLAIM]);
			fixture.componentInstance.mode.set('hide');
			await settle(fixture);

			const root = query(fixture, 'root')!;
			expect(root.inert).toBeFalse();
			expect(root.classList).not.toContain('claim-locked');
		});

		it('keeps an inert the application set before locking', async () => {
			const fixture = await create(true);
			const root = query(fixture, 'root')!;
			root.inert = true;

			claims.claims.set([]);
			await settle(fixture);
			claims.claims.set([CLAIM]);
			await settle(fixture);

			expect(root.inert).toBeTrue();
		});

		it('does not touch granted content when the claims are set again unchanged', async () => {
			const fixture = await create(true);
			const root = query(fixture, 'root')!;
			const textarea = query<HTMLTextAreaElement>(fixture, 'textarea')!;
			root.classList.add('disabled');
			textarea.disabled = true;

			claims.claims.set([CLAIM]);
			await settle(fixture);

			expect(root.classList).toContain('disabled');
			expect(textarea.disabled).toBeTrue();
		});

		it('locks root nodes rendered after the lock was applied', async () => {
			claims.claims.set([]);
			const fixture = TestBed.createComponent(LateRootHostComponent);
			await settle(fixture);
			expect(query(fixture, 'late')).toBeNull();

			fixture.componentInstance.showLate.set(true);
			await settle(fixture);

			const late = query<HTMLButtonElement>(fixture, 'late')!;
			expect(late.inert).toBeTrue();
			expect(late.disabled).toBeTrue();
			expect(late.classList).toContain('claim-locked');
		});

		it('locks when an additional check fails although the claim is granted', async () => {
			const fixture = await create(true);

			fixture.componentInstance.checks.set([() => false]);
			await settle(fixture);

			expect(query(fixture, 'root')!.inert).toBeTrue();
		});

		it('calls the lock and unlock handlers once per state change', async () => {
			const fixture = await create(false);
			const host = fixture.componentInstance;
			expect(host.locks).toBe(1);
			expect(host.unlocks).toBe(0);

			claims.claims.set([CLAIM]);
			await settle(fixture);
			claims.claims.set([CLAIM]);
			await settle(fixture);

			expect(host.locks).toBe(1);
			expect(host.unlocks).toBe(1);
		});

		it('can be destroyed while locked', async () => {
			const fixture = await create(false);

			expect(() => fixture.destroy()).not.toThrow();
		});
	});
});
