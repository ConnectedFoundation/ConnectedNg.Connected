import { Component, computed, inject, Injector } from '@angular/core';
import { CodeListInsertForm, CodeListInsertFormBase } from '@connected-ng/components/code-lists';
import { hideField, localizeFields } from '@connected-ng/components/code-lists/helpers';
import { routePattern, Status } from '@connected-ng/core';
import { StackComponent, StackPageInfo } from '@connected-ng/components/navigation';
import { DynamicFormMetadata, FormGenerationInterceptors, FormResult } from '@connected-ng/components/forms';
import { RoleInsertFormFields } from './role-insert-form-fields/role-insert-form-fields';
import { InsertRoleDto } from '../../../services/roles/dtos/role-dtos';
import { RoleService } from '../../../services/roles/role-service';

@Component({
  selector: 'cn-role-insert-form',
  imports: [StackComponent],
  template: CodeListInsertFormBase.TEMPLATE,
  styleUrl: './role-insert-form.scss',
})
export class RoleInsertForm extends CodeListInsertFormBase<InsertRoleDto> {
  static readonly routePattern = routePattern('new');

  static fieldLocalizer = localizeFields({
    'name': () => $localize`:@@role.name:Name`,
    'parent': () => $localize`:@@role.parent:Parent role`,
  });

  static fromParams(params: Record<string, string>, injector: Injector): StackPageInfo<unknown> {
    let service = injector.get(RoleService);

    const formInterceptors: FormGenerationInterceptors = {
      fieldInterceptors: [
        hideField('status'),
        this.fieldLocalizer,
      ],
      afterGeneration: (metadata: DynamicFormMetadata) => {
        metadata.formGroup.get('status')?.setValue(Status.Enabled);
      },
    };

    return {
      component: RoleInsertFormFields,
      title: $localize`:@@role.new-title:New role`,
      key: RoleInsertForm.routePattern.pattern,
      pattern: RoleInsertForm.routePattern.pattern,
      data: {
        serviceOperation: service.insert,
        title: $localize`:@@role.new-title:New role`,
        formInterceptors,
      },
      pageFactory: (params) => RoleInsertForm.fromParams(params, injector)
    };
  }

  service = inject(RoleService);

  pageInfo = computed<StackPageInfo<CodeListInsertForm<InsertRoleDto>>>(() => {
    return {
      component: RoleInsertFormFields,
      key: 'new',
      data: {
        serviceOperation: this.service.insert,
        formInterceptors: {
          fieldInterceptors: [
            hideField('status'),
            RoleInsertForm.fieldLocalizer,
          ],
          afterGeneration: (metadata: DynamicFormMetadata) => {
            metadata.formGroup.get('status')?.setValue(Status.Enabled);
          },
        },
      },
      outputs: {
        formClose: (result: FormResult) => this.onClose(result)
      }
    };
  });
}
