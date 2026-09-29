import { OAUTH_SCOPES, type OAuthUrls } from "./config";

export type MetadataOptions = { dynamicRegistration: boolean };

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata(
  urls: OAuthUrls,
  options: MetadataOptions = { dynamicRegistration: true },
) {
  return {
    issuer: urls.issuer,
    authorization_endpoint: urls.authorizationEndpoint,
    token_endpoint: urls.tokenEndpoint,
    // Advertised only where DCR is open; production relies on CIMD.
    ...(options.dynamicRegistration ? { registration_endpoint: urls.registrationEndpoint } : {}),
    revocation_endpoint: urls.revocationEndpoint,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...OAUTH_SCOPES],
    // CIMD is how ChatGPT prefers to identify itself; DCR stays for clients
    // on hosts not in POWERFUND_OAUTH_CIMD_HOSTS (MCP Inspector, local CLIs).
    client_id_metadata_document_supported: true,
    // Every authorization response carries `iss` (RFC 9207).
    authorization_response_iss_parameter_supported: true,
  };
}

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function protectedResourceMetadata(urls: OAuthUrls) {
  return {
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "PowerFund",
  };
}
