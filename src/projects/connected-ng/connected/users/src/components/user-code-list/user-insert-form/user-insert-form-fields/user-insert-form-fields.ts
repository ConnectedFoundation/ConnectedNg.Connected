import { Component, computed } from '@angular/core';
import { CodeListInsertForm } from "@connected-ng/components/code-lists";
import { ReactiveFormsModule } from '@angular/forms';
import { DynamicFormFieldComponent } from "@connected-ng/components/forms";
import { ActionsProviderContract } from '@connected-ng/components/navigation';
import { User } from '../../../../services/users/dtos/user-dtos';

@Component({
	selector: 'cn-user-insert-form-fields',
	imports: [ReactiveFormsModule, DynamicFormFieldComponent],
	templateUrl: './user-insert-form-fields.html',
	styleUrl: './user-insert-form-fields.scss',
})
export class UserInsertFormFields extends CodeListInsertForm<User> implements ActionsProviderContract {
	firstName = computed(() => {
		const firstName = this.field('firstName')();
		if (firstName)
			firstName.fieldConfig.label = $localize`:@@user.first-name:First name`;
		return firstName;
	});
	lastName = computed(() => {
		const lastName = this.field('lastName')();
		if (lastName)
			lastName.fieldConfig.label = $localize`:@@user.last-name:Last name`;
		return lastName;
	});
	email = computed(() => {
		const email = this.field('email')();
		if (email)
			email.fieldConfig.label = $localize`:@@cn.user-update-form.email-label:Username`;
		return email;
	});
}
