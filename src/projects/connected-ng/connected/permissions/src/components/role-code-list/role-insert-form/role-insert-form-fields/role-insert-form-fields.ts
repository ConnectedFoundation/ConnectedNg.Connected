import { Component, computed } from '@angular/core';
import { CodeListInsertForm } from '@connected-ng/components/code-lists';
import { ReactiveFormsModule } from '@angular/forms';
import { DynamicFormFieldComponent } from '@connected-ng/components/forms';
import { ActionsProviderContract } from '@connected-ng/components/navigation';
import { InsertRoleDto } from '../../../../services/roles/dtos/role-dtos';
import { RoleSelectBox } from '../../role-select-box/role-select-box';

@Component({
  selector: 'cn-role-insert-form-fields',
  imports: [ReactiveFormsModule, DynamicFormFieldComponent, RoleSelectBox],
  templateUrl: './role-insert-form-fields.html',
  styleUrl: './role-insert-form-fields.scss',
})
export class RoleInsertFormFields extends CodeListInsertForm<InsertRoleDto> implements ActionsProviderContract {
  name = computed(() => {
    const name = this.field('name')();
    if (name)
      name.fieldConfig.label = $localize`:@@role.name:Name`;
    return name;
  });
  parent = computed(() => {
    const parent = this.field('parent')();
    if (parent)
      parent.fieldConfig.label = $localize`:@@role.parent:Parent role`;
    return parent;
  });
}
