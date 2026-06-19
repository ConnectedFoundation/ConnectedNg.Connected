import { inject, Injectable, InjectionToken } from '@angular/core';
import { ConnectedServiceBase, configurationValue } from '@connected-ng/core';
import { Claim, QueryIdentityClaimsDto } from './dtos/claim-dtos';

@Injectable({
	providedIn: 'root',
})
export class ClaimExtensionsService extends ConnectedServiceBase {
	override getBaseUrl(): string {
		return this.configuration.baseUrl();
	}

	serviceUrl = 'services/identities';

	private configuration = inject(CLAIM_EXTENSIONS_SERVICE_CONFIG);

	query = this.createGetOperation<QueryIdentityClaimsDto, Claim[]>('query-claims');
}

export const CLAIM_EXTENSIONS_SERVICE_CONFIG = new InjectionToken<ClaimExtensionsServiceConfiguration>('CLAIM_EXTENSIONS_SERVICE_CONFIG');

export class ClaimExtensionsServiceConfiguration {
	baseUrl = configurationValue.required('Claim extensions service url');
}