import { Component, computed, inject, Injector, OnDestroy, signal } from '@angular/core';
import { routePattern } from '@connected-ng/core';
import { CodeListActions, CodeListActionsComponent, CodeListBase, CodeListList, CodeListStackPageInfo } from '@connected-ng/components/code-lists';
import { RoleCodeListHeader } from './role-code-list-header/role-code-list-header';
import { RoleService } from '../../services/roles/role-service';
import { Role } from '../../services/roles/dtos/role-dtos';
import { RoleInsertForm } from './role-insert-form/role-insert-form';
import { RoleUpdateForm } from './role-update-form/role-update-form';
import { ChildPageProviderService, ChildPageRegistration, POP_NAVIGATION } from '@connected-ng/components/navigation';
import { RoleUpdateFormFields } from './role-update-form/role-update-form-fields/role-update-form-fields';
import { Subscription } from 'rxjs';
import { MatTooltip } from '@angular/material/tooltip';
import { NotificationService } from '@connected-ng/components/notifications';
import { FormResult } from '@connected-ng/components/forms';

@Component({
	selector: 'cn-role-code-list',
	imports: [CodeListList, CodeListActionsComponent, MatTooltip],
	templateUrl: './role-code-list.html',
	styleUrl: './role-code-list.scss',
})
export class RoleCodeList extends CodeListBase implements OnDestroy {
	static readonly routePattern = routePattern('roles');

	readonly statusLabels: Record<number, string> = {
		1: $localize`:@@role.status-enabled-label:Enabled`,
		2: $localize`:@@role.status-disabled-label:Disabled`,
	};
	
	static fromParams(injector: Injector): CodeListStackPageInfo {
		let insertForm = RoleInsertForm.fromParams({}, injector);
		insertForm.outputs = { formClose: POP_NAVIGATION };

		let updateForm = RoleUpdateForm.fromParams({}, injector);
		updateForm.outputs = { formClose: POP_NAVIGATION };

		return {
			component: RoleCodeList,
			headerComponent: RoleCodeListHeader,
			key: RoleCodeList.routePattern.pattern,
			icon: 'manage_accounts',
			data: {},
			title: $localize`:@@cn.roles.list-header:Roles`,
			childPages: [
				insertForm,
				updateForm
			]
		};
	}

	roleService = inject(RoleService);
	private readonly notificationService = inject(NotificationService);
	private childPageProvider = inject(ChildPageProviderService, { optional: true });

	items = signal<Role[]>([]);
	readonly sortedItems = computed(() =>
		[...this.items()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
	);
	readonly filter = (item: Role, query: string) =>
		(item.name ?? '').toLowerCase().includes(query);


	leftActions(item: Role) {
		const registrations = this.childPageProvider?.getRegistrations(RoleUpdateFormFields) ?? [];
		return [
			CodeListActions.editAction(
				(i: unknown) => this.navigateToItem(i as Role),
				(i: unknown) => `${this.navigationContext.getUrlFromStack()}/${RoleUpdateForm.routePattern.build({ id: (i as Role).id })}`
			),
			...registrations
				.filter(r => r.action)
				.map(r => CodeListActions.relatedCodeListAction(
					(i: unknown) => this.navigateToChildPage(i as Role, r),
					(i: unknown) => `${this.navigationContext.getUrlFromStack()}/${RoleUpdateForm.routePattern.build({ id: (i as Role).id })}/${r.routePattern}`,
					r.action!.label,
					r.action?.description
				))
		];
	}

	rightActions(item: Role) {
		return [
			CodeListActions.getStatusChangeAction(
				item,
				(i: unknown) => this.roleService.update(i as Role).subscribe({
					next: () => {
						const status = (i as Role).status;
						this.notificationService.success(
							status === 1
								? $localize`:@@role.status-enabled:Role was successfully enabled.`
								: $localize`:@@role.status-disabled:Role was successfully disabled.`
						);
					},
					error: () => this.notificationService.error($localize`:@@role.status-change-error:Error changing role status.`)
				})
			)
		];
	}

	override codeListActions = signal([
		CodeListActions.insertItemAction(
			() => this.navigateToInsert(),
			`${this.navigationContext.getUrlFromStack()}/${RoleInsertForm.routePattern.pattern}`
		)
	]);

	navigateToInsert() {
		const insertPage = RoleInsertForm.fromParams({}, this.injector);
		insertPage.outputs = {
			formClose: (result: FormResult) => {
				if (result?.success) this.notificationService.success($localize`:@@role.insert-success:Role was successfully added.`);
				this.navigationContext.back();
			},
			formError: () => this.notificationService.error($localize`:@@role.insert-error:Error adding role.`)
		};
		this.navigationContext.push(insertPage);
	}

	navigateToItem(item: Role) {
		const updatePage = RoleUpdateForm.fromParams({ id: item.id.toString() }, this.injector);
		updatePage.outputs = {
			formClose: (result: FormResult) => {
				if (result?.success) this.notificationService.success($localize`:@@role.update-success:Role was successfully updated.`);
				this.navigationContext.back();
			},
			formError: () => this.notificationService.error($localize`:@@role.update-error:Error updating role.`)
		};
		this.navigationContext.push(updatePage);
	}

	navigateToChildPage(item: Role, registration: ChildPageRegistration) {
		const childPage = registration.factory({ id: item.id.toString() }, this.injector);
		const updatePage = RoleUpdateForm.fromParams({ id: item.id.toString() }, this.injector);
		updatePage.outputs = { formClose: () => this.navigationContext.pop() };
		this.navigationContext.push(updatePage, childPage);
	}

	statusLabel(status: number): string {
		return this.statusLabels[status] ?? '';
	}

	override ngOnInit() {
		super.ngOnInit();
		this.subscriptions.add(
			this.roleService.queryAndSubscribe$().subscribe(items => this.items.set(items.filter(r => r.id > 0)))
		);
	}

	override ngOnDestroy() {
		this.subscriptions.unsubscribe();
	}
}