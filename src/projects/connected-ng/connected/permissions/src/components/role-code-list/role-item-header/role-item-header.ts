import { Component, effect, signal } from '@angular/core';
import { CodeListHeaderBase } from '@connected-ng/components/code-lists';
import { Role } from '../../../services/roles/dtos/role-dtos';
import { Observable } from 'rxjs';
import { MatIcon } from '@angular/material/icon';

@Component({
	selector: 'cn-role-item-header',
	imports: [MatIcon],
	templateUrl: './role-item-header.html',
	styleUrl: './role-item-header.scss',
})
export class RoleItemHeader extends CodeListHeaderBase {
	role = signal<Role | undefined>(undefined);

	constructor() {
		super();

		effect(() => {
			if (this.data()?.entityLoader) {
				this.subscriptions.add((this.data().entityLoader as Observable<Role>).subscribe(role => {
					this.role.set(role);
				}));
			}
		});
	}
}
