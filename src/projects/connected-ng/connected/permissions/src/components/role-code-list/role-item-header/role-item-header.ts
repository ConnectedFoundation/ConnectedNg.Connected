import { Component, computed, effect, inject, signal } from '@angular/core';
import { CodeListHeaderBase } from '@connected-ng/components/code-lists';
import { Role } from '../../../services/roles/dtos/role-dtos';
import { Observable } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { RoleService } from '../../../services/roles/role-service';

@Component({
	selector: 'cn-role-item-header',
	imports: [MatIcon],
	templateUrl: './role-item-header.html',
	styleUrl: './role-item-header.scss',
})
export class RoleItemHeader extends CodeListHeaderBase {
	role = signal<Role | undefined>(undefined);
	private allRoles = signal<Role[]>([]);
	private roleService = inject(RoleService);

	parentName = computed(() => {
		const r = this.role();
		if (!r?.parent) return '';
		return this.allRoles().find(x => x.id === r.parent)?.name ?? '';
	});

	constructor() {
		super();

		effect(() => {
			if (this.data()?.entityLoader) {
				this.subscriptions.add((this.data().entityLoader as Observable<Role>).subscribe(role => {
					this.role.set(role);
				}));
			}
		});

		this.subscriptions.add(
			this.roleService.queryAndSubscribe$().subscribe(roles => this.allRoles.set(roles))
		);
	}
}
