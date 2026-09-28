/** The query parameters an authorization request carries through consent. */
export const AUTHORIZE_PARAM_NAMES = [
  "response_type",
  "client_id",
  "redirect_uri",
  "state",
  "scope",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;
