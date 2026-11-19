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

		it('renders locked content inert, with the locked classes and disabled native controls', async () => {
			const fixture = await create(false);
			const root = query(fixture, 'root')!;

			expect(root.inert).toBeTrue();
			expect(root.classList).toContain('claim-locked');
			expect(root.classList).toContain('disabled');
			expect(root.classList).toContain('read-only');
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
			expect(root.classList).not.toContain('disabled');
			expect(query<HTMLButtonElement>(fixture, 'app-disabled')!.disabled).toBeTrue();
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
