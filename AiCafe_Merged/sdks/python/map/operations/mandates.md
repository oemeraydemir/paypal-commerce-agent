<!-- Generated file — do not edit; regenerated with the SDK. -->

# Mandates — operations

Accessor: `client.mandates` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/mandates.py` · 2 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.mandates.get_order_mandate

- **Route**: `GET /api/orders/{orderId}/mandate`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def get_order_mandate(order_id: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `order_id`
- **Params**: `order_id` — path `orderId`
- **Returns (parsed)**: `SignedCartMandate`
- **Returns (raw)**: `ApiResult[SignedCartMandate, GetOrderMandateErrorBody]`
- **Error**: `GetOrderMandateErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [401, 404, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `SignedCartMandate` | `ai_caf_pay_pal_commerce_agent_api/models/signed_cart_mandate.py` |
| `GetOrderMandateErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_order_mandate_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.mandates.post_mandates_verify

- **Route**: `POST /api/mandates/verify`
- **Signature**: `def post_mandates_verify(body: SignedCartMandate | SignedCartMandateDict, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `body`
- **Params**: `body` — JSON body
- **Returns (parsed)**: `MandateVerification`
- **Returns (raw)**: `ApiResult[MandateVerification, PostMandatesVerifyErrorBody]`
- **Error**: `PostMandatesVerifyErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `SignedCartMandate` | `ai_caf_pay_pal_commerce_agent_api/models/signed_cart_mandate.py` |
| `SignedCartMandateDict` | `ai_caf_pay_pal_commerce_agent_api/models/signed_cart_mandate.py` |
| `MandateVerification` | `ai_caf_pay_pal_commerce_agent_api/models/mandate_verification.py` |
| `PostMandatesVerifyErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_mandates_verify_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

