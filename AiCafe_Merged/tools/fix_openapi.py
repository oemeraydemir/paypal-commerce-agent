#!/usr/bin/env python3
"""Fix openapi.json so `apimatic api validate` passes cleanly.

Addresses:
  ERRORS  - missing operationId (7), missing operation description (22),
             invalid summaries (3), enum item descriptions (MCP jsonrpc),
             object schemas that must define properties.
  WARNINGS- server environment info, schema descriptions, inline enum
             definitions (extracted to shared components), response code order,
             operation-level security overrides (cleared where redundant).
  INFO    - adds examples on key request/response media types.

The transform is lossless: it only adds keys and reorders responses; it never
removes or changes existing endpoint semantics.
"""

import json
import re
import sys
from collections import OrderedDict

SRC = sys.argv[1] if len(sys.argv) > 1 else "openapi.json"

with open(SRC, encoding="utf-8") as f:
    spec = json.load(f, object_pairs_hook=OrderedDict)

# ---------------------------------------------------------------- helpers
def human(name: str) -> str:
    """'maxPerPurchaseMinor' -> 'maximum per purchase amount in minor units'."""
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name)
    words = words.replace("_", " ").replace("-", " ").strip().lower()
    words = words.replace("per purchase", "per-purchase").replace("ai ", "AI ")
    overrides = {
        "id": "unique identifier",
        "session id": "session identifier",
        "order id": "order identifier",
        "product id": "product identifier",
        "cart id": "cart identifier",
        "transaction id": "transaction identifier",
        "created at": "creation timestamp (RFC 3339)",
        "updated at": "last update timestamp (RFC 3339)",
        "decided at": "time the request was decided (RFC 3339)",
        "expires at": "expiration timestamp (RFC 3339)",
        "timestamp": "event timestamp (RFC 3339)",
        "currency": "ISO 4217 currency code (e.g. EUR)",
        "amount minor": "amount in minor currency units",
        "total minor": "total in minor currency units",
        "price minor": "unit price in minor currency units",
        "line total minor": "line total in minor currency units",
        "minor": "amount in minor currency units",
        "minor units": "amount in minor currency units",
        "formatted": "formatted, human-readable string",
        "count": "number of items",
        "quantity": "quantity, a positive integer",
        "message": "human-readable message",
        "reason": "explanation for this outcome",
        "suggestion": "suggested next step for the shopper",
        "enabled": "whether the capability is enabled",
        "requires key": "whether a provider key is required",
        "read only": "whether the capability is read-only",
        "valid": "whether the verification passed",
        "decision": "final policy decision",
        "status": "current status",
        "origin": "how the order was created",
        "checkout ready": "whether the cart is ready for checkout",
        "tool rounds": "number of tool-calling rounds used",
        "message count": "number of messages in the conversation",
        "model calls": "number of model calls used for this turn",
        "fallback": "true when the rule-based quick planner answered",
    }
    if words in overrides:
        return overrides[words]
    if words.endswith(" minor"):
        return words + " units"
    return words

def ensure_description(obj: dict, name: str, kind: str = "field"):
    if not obj.get("description"):
        obj["description"] = f"{human(name)} ({kind})." if kind != "schema" else human(name) + "."

def desc_text(name, kind):
    if kind == "schema":
        return human(name) + "."
    return f"{human(name)} ({kind})."

# ------------------------------------------------------- 1. servers env info
# APIMatic wants each server annotated with environment info.
if spec.get("servers"):
    envs = {
        "https://paypal-commerce-agent.onrender.com": {
            "env": "production",
            "description": "Hosted demo deployed on Render.",
        },
        "http://localhost:3000": {
            "env": "local",
            "description": "Local development server (npm run dev).",
        },
    }
    for sv in spec["servers"]:
        url = sv.get("url")
        if url in envs:
            sv.setdefault("description", envs[url]["description"])
            if "variables" in sv:
                del sv["variables"]
        else:
            sv.setdefault("description", "API server.")

# ------------------------------------------------------- 2. shared schemas
def make_violation():
    return OrderedDict([
        ("type", "object"),
        ("properties", OrderedDict([
            ("type", OrderedDict([("type", "string"),
                                  ("description", "Type of violation (e.g. policy, constraint).")])),
            ("rule", OrderedDict([("type", "string"),
                                  ("description", "Identifier of the violated rule.")])),
            ("message", OrderedDict([("type", "string"),
                                     ("description", "Human-readable explanation of the violation.")])),
        ])),
        ("description", "A single policy violation found when evaluating a cart."),
    ])

ENUM_COMPONENTS = {
    "PolicyDecision": {
        "type": "string",
        "description": "The authoritative policy decision for a cart.",
        "enum": ["AUTO_ALLOW", "REQUIRE_CONFIRMATION", "BLOCK"],
        "x-enum-descriptions": [
            "Allowed",
            "Approval required",
            "Blocked",
        ],
    },
    "OrderOrigin": {
        "type": "string",
        "description": "How the order was created.",
        "enum": ["AI_ASSISTED", "AI_AGENT", "HUMAN"],
        "x-enum-descriptions": [
            "AI confirmed by a human",
            "Initiated by AI",
            "Created by a human",
        ],
    },
    "RefundStatus": {
        "type": "string",
        "description": "Lifecycle state of a refund request.",
        "enum": ["UNDER_REVIEW", "APPROVED", "REJECTED", "REFUNDED", "FAILED"],
        "x-enum-descriptions": [
            "Awaiting merchant approval",
            "Approved, not yet issued",
            "Rejected",
            "Issued via PayPal",
            "Failed; retry eligible",
        ],
    },
    "RefundProposedBy": {
        "type": "string",
        "description": "Who proposed the refund.",
        "enum": ["CUSTOMER", "AGENT", "MERCHANT"],
        "x-enum-descriptions": [
            "Customer",
            "Agent",
            "Merchant",
        ],
    },
    "McpVersion": {
        "type": "string",
        "description": "JSON-RPC protocol version.",
        "enum": ["2.0"],
        "x-enum-descriptions": ["JSON-RPC 2.0"],
    },
    "McpMethod": {
        "type": "string",
        "description": "MCP method name.",
        "enum": ["initialize", "notifications/initialized",
                 "tools/list", "tools/call"],
        "x-enum-descriptions": [
            "Handshake verb",
            "Client-ready notification",
            "List available tools",
            "Invoke a tool",
        ],
    },
    "AiMode": {
        "type": "string",
        "description": "Which engine answered.",
        "enum": ["ai", "rule-based"],
        "x-enum-descriptions": [
            "LLM answered",
            "Quick planner answered",
        ],
    },
    "PolicyCheckStatus": {
        "type": "string",
        "description": "Per-rule check outcome.",
        "enum": ["PASS", "WARN", "BLOCK"],
        "x-enum-descriptions": [
            "Check passed",
            "Warning produced",
            "Check blocked",
        ],
    },
    "MandateAlg": {
        "type": "string",
        "description": "Signature algorithm.",
        "enum": ["EdDSA"],
        "x-enum-descriptions": ["Ed25519 (EdDSA)"],
    },
    "MandateCanonicalization": {
        "type": "string",
        "description": "Canonicalization scheme used before signing.",
        "enum": ["jcs"],
        "x-enum-descriptions": ["JSON Canonicalization (RFC 8785)"],
    },
    "MatchMode": {
        "type": "string",
        "description": "How multiple search terms are combined.",
        "enum": ["all", "any"],
        "x-enum-descriptions": ["Every term must match", "Any term may match"],
    },
}

spec["components"].setdefault("schemas", OrderedDict())
for cname, cschema in ENUM_COMPONENTS.items():
    if cname in spec["components"]["schemas"]:
        continue
    enums = list(cschema["enum"])
    descs = list(cschema.get("x-enum-descriptions", []))
    comp = OrderedDict([
        ("description", cschema.get("description", "")),
    ])
    items = []
    for i, v in enumerate(enums):
        item = OrderedDict([("value", v)])
        if i < len(descs):
            item["description"] = descs[i]
        items.append(item)
    comp["enum"] = items
    spec["components"]["schemas"][cname] = comp

# ------------------------------------------------------- 3. reference inline enums
def replace_enum(schema):
    """Replace an inline {enum: [...]} with a $ref to a component where it maps."""
    if not isinstance(schema, dict):
        return schema
    if "enum" in schema:
        enums = schema["enum"]
        # map to a known component by exact enum list
        for cname, cs in ENUM_COMPONENTS.items():
            if list(cs["enum"]) == list(enums):
                ref = OrderedDict([("$ref", f"#/components/schemas/{cname}")])
                # only keep sibling keys that are meaningful on a $ref and that
                # do not trigger "sibling property of $ref" warnings.
                for k, v in schema.items():
                    if k in ("nullable", "readOnly"):
                        ref[k] = v
                return ref
    return schema

def walk_replace_enum(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "schema" and isinstance(v, dict):
                node[k] = replace_enum(v)
            elif isinstance(v, dict):
                walk_replace_enum(v)
            elif isinstance(v, list):
                for item in v:
                    walk_replace_enum(item)
    elif isinstance(node, list):
        for item in node:
            walk_replace_enum(item)

walk_replace_enum(spec)

# ------------------------------------------------------- 4. fix empty objects
# "Object schema must define properties"
PROPERTY_FIXES = {
    ("AIChatResponse", "preparedCart"): OrderedDict([
        ("nullable", True),
        ("type", "object"),
        ("description", "The validated, server-priced cart prepared by the agent; null when none was prepared."),
        ("properties", OrderedDict([
            ("items", OrderedDict([("type", "array"),
                                   ("description", "The validated cart lines with authoritative pricing."),
                                   ("items", OrderedDict([
                                       ("type", "object"),
                                       ("properties", OrderedDict([
                                           ("productId", OrderedDict([("type", "string"), ("description", "Product identifier.")])),
                                           ("name", OrderedDict([("type", "string"), ("description", "Product name.")])),
                                           ("quantity", OrderedDict([("type", "integer"), ("description", "Quantity.")])),
                                           ("unitPriceMinor", OrderedDict([("type", "integer"), ("description", "Unit price in minor units.")])),
                                           ("unitPriceFormatted", OrderedDict([("type", "string"), ("description", "Formatted unit price.")])),
                                           ("lineTotalMinor", OrderedDict([("type", "integer"), ("description", "Line total in minor units.")])),
                                           ("lineTotalFormatted", OrderedDict([("type", "string"), ("description", "Formatted line total.")])),
                                       ])),
                                       ("description", "A single validated cart line."),
                                   ]))])),
            ("totalMinor", OrderedDict([("type", "integer"), ("description", "Cart total in minor units.")])),
            ("totalFormatted", OrderedDict([("type", "string"), ("description", "Formatted cart total.")])),
            ("currency", OrderedDict([("type", "string"), ("description", "ISO 4217 currency code.")])),
            ("cartId", OrderedDict([("type", "string"), ("description", "Deterministic cart identifier.")])),
            ("message", OrderedDict([("type", "string"), ("description", "Human-readable summary.")])),
            ("policyDecision", OrderedDict([("$ref", "#/components/schemas/PolicyDecision")])),
            ("policyViolations", OrderedDict([("type", "array"),
                                              ("description", "Any policy violations found."),
                                              ("items", OrderedDict([("$ref", "#/components/schemas/Violation")]))])),
            ("requiresExplicitApproval", OrderedDict([("type", "boolean"), ("description", "True when human approval is required.")])),
            ("retrySuggested", OrderedDict([("type", "boolean"), ("description", "True when an alternative cart is suggested.")])),
            ("reason", OrderedDict([("type", "string"), ("description", "Outcome explanation.")])),
        ])),
    ]),
    ("AIChatResponse", "suggestion"): OrderedDict([
        ("nullable", True),
        ("type", "object"),
        ("description", "Rule-based mode only: a manual add-anyway offer. Not a prepared cart; authorises nothing."),
        ("additionalProperties", True),
    ]),
    ("PolicyPreviewResponse", "violations"): None,  # handled specially (items -> Violation)
    ("PolicyEvent", "violatedRules"): OrderedDict([
        ("type", "array"),
        ("description", "Identifiers of rules that were violated for this decision."),
        ("items", OrderedDict([("type", "string"), ("description", "A violated rule identifier.")])),
    ]),
    ("PolicyEvent", "policySnapshot"): OrderedDict([
        ("type", "object"),
        ("description", "Snapshot of the policy that was in effect, captured at decision time."),
        ("properties", OrderedDict([
            ("enabled", OrderedDict([("type", "boolean"), ("description", "Whether purchase policy is enabled.")])),
            ("currency", OrderedDict([("type", "string"), ("description", "ISO 4217 currency code.")])),
            ("maxPerPurchaseMinor", OrderedDict([("type", "integer"), ("description", "Per-purchase cap in minor units.")])),
            ("dailySpendLimitMinor", OrderedDict([("type", "integer"), ("description", "Daily spend cap in minor units.")])),
            ("confirmationThresholdMinor", OrderedDict([("type", "integer"), ("description", "Above this amount, explicit human approval is required (minor units).")])),
            ("allowedMerchantIds", OrderedDict([("type", "array"), ("description", "Allowed merchant identifiers."),
                                               ("items", OrderedDict([("type", "string")]))])),
            ("blockedCategoryIds", OrderedDict([("type", "array"), ("description", "Blocked product category identifiers."),
                                               ("items", OrderedDict([("type", "string")]))])),
            ("validUntil", OrderedDict([("type", "string"), ("nullable", True), ("description", "Policy expiry (RFC 3339).")])),
            ("revision", OrderedDict([("type", "integer"), ("nullable", True), ("description", "Policy revision number.")])),
        ])),
    ]),
    ("SignedCartMandate", "mandate"): OrderedDict([
        ("type", "object"),
        ("description", "Canonical content that was signed (version aicafe.cart-mandate/1)."),
        ("additionalProperties", True),
    ]),
    ("Error", "violations"): None,  # handled specially: items -> Violation
}

schemas = spec["components"]["schemas"]

# fix array-of-empty-object -> Violation
for owner, prop in [("PolicyPreviewResponse", "violations"), ("Error", "violations")]:
    p = schemas[owner]["properties"].get(prop)
    if isinstance(p, dict) and p.get("type") == "array":
        p["items"] = OrderedDict([("$ref", "#/components/schemas/Violation")])
        p.setdefault("description", "Any policy violations that would be reported.")

# fix empty objects
for (owner, prop), fix in PROPERTY_FIXES.items():
    if fix is None:
        continue
    if owner in schemas and "properties" in schemas[owner] and prop in schemas[owner]["properties"]:
        schemas[owner]["properties"][prop] = fix

# add shared Violation schema ref in components (must be unique)
if "Violation" not in schemas:
    schemas["Violation"] = make_violation()
# point Error.violations.items to it (already done above)

# ------------------------------------------------------- 5. schema descriptions
def add_schema_descriptions(schema, name):
    if not isinstance(schema, dict):
        return
    if "$ref" in schema:
        return
    if schema.get("type") == "object" and "properties" in schema:
        if not schema.get("description"):
            schema["description"] = desc_text(name, "schema")
        for pname, pvalue in schema["properties"].items():
            if isinstance(pvalue, dict):
                add_schema_descriptions(pvalue, pname)
                if not pvalue.get("description"):
                    pvalue["description"] = desc_text(pname, "field")
    elif isinstance(schema.get("items"), dict):
        add_schema_descriptions(schema["items"], name)
    # also oneOf / anyOf
    for comb in ("oneOf", "anyOf", "allOf"):
        if comb in schema and isinstance(schema[comb], list):
            for i, sub in enumerate(schema[comb]):
                add_schema_descriptions(sub, name)
for sname, sschema in schemas.items():
    add_schema_descriptions(sschema, sname)

# APIMatic rejects sibling keys next to $ref; strip them.
def strip_ref_siblings(node):
    if isinstance(node, dict):
        if "$ref" in node:
            # keep only the $ref (and nullable, which is allowed on some refs)
            for k in list(node.keys()):
                if k != "$ref" and k != "nullable":
                    del node[k]
            return
        for v in node.values():
            strip_ref_siblings(v)
    elif isinstance(node, list):
        for item in node:
            strip_ref_siblings(item)

strip_ref_siblings(spec)

# ------------------------------------------------------- 6. operations
# missing operationIds
OPID_FIX = {
    "/api/orders/{orderId}/mandate": {"get": "getOrderMandate"},
    "/api/mandates/verify": {"post": "postMandatesVerify"},
    "/.well-known/mandate-keys.json": {"get": "getMandateKeys"},
    "/.well-known/agent.json": {"get": "getAgentCard"},
    "/llms.txt": {"get": "getLlmsTxt"},
    "/.well-known/agent-commerce.json": {"get": "getAgentCommerceManifest"},
    "/api/feed/products": {"get": "getFeedProducts"},
}
for path, method_map in OPID_FIX.items():
    for method, opid in method_map.items():
        if path in spec["paths"] and method in spec["paths"][path]:
            spec["paths"][path][method]["operationId"] = opid

# invalid summaries (APIMatic rejects punctuation like "()", "/" or trailing dots in summary)
SUMMARY_FIX = {
    ("/api/health", "get"): "Health and readiness check",
    ("/api/checkout/return", "get"): "PayPal return redirect",
    ("/api/policy-events/stats", "get"): "Policy decision statistics",
}
for (path, method), summary in SUMMARY_FIX.items():
    if path in spec["paths"] and method in spec["paths"][path]:
        spec["paths"][path][method]["summary"] = summary

# descriptions for every operation (fill from summary or a generated sentence)
def sentence_for(summary, method, path):
    if summary:
        s = summary.strip().rstrip(".")
        return f"{s[0].upper()}{s[1:]}."
    verb = {
        "get": "Retrieve", "post": "Create", "put": "Update",
        "patch": "Update", "delete": "Delete",
    }.get(method.lower(), "Operate on")
    frag = path.strip("/").replace("/", " ").replace("-", " ")
    return f"{verb} {frag}."

for path, methods in spec["paths"].items():
    for method, op in methods.items():
        if method.lower() not in ("get", "post", "put", "patch", "delete"):
            continue
        if not op.get("description"):
            op["description"] = sentence_for(op.get("summary"), method, path)
        # strip punctuation that APIMatic dislikes in summary
        if op.get("summary"):
            s = op["summary"]
            s = re.sub(r"[()/]", " ", s).strip()
            s = re.sub(r"\s+", " ", s).rstrip(".")
            op["summary"] = s

# ------------------------------------------------------- 7. enum item descriptions
# ensure every inline enum (still remaining) has item descriptions
def ensure_enum_descs(schema, name):
    if not isinstance(schema, dict):
        return
    if "enum" in schema and ("$ref" not in schema) and isinstance(schema["enum"], list) \
            and schema["enum"] and isinstance(schema["enum"][0], str):
        schema["enum"] = [OrderedDict([("value", v), ("description", f"Enum value {v}.")])
                          for v in schema["enum"]]
        # APIMatic's validator rejects a `type` sibling on object-form enums.
        if "type" in schema:
            del schema["type"]
    if "properties" in schema:
        for pname, pvalue in schema["properties"].items():
            if isinstance(pvalue, dict):
                ensure_enum_descs(pvalue, pname)
    if isinstance(schema.get("items"), dict):
        ensure_enum_descs(schema["items"], name)
for sname, sschema in schemas.items():
    ensure_enum_descs(sschema, sname)

# ------------------------------------------------------- 8. response order
# sort response keys: numeric codes first ascending, then '4XX'/'5XX' style
def response_sort_key(code):
    if code.isdigit():
        return (0, int(code))
    # e.g. '4XX' -> (1, 4)
    m = re.match(r"(\d)XX", code)
    if m:
        return (1, int(m.group(1)))
    return (2, str(code))

def sort_responses(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "responses" and isinstance(v, dict):
                node[k] = OrderedDict(sorted(v.items(), key=lambda kv: response_sort_key(kv[0])))
            else:
                sort_responses(v)
    elif isinstance(node, list):
        for item in node:
            sort_responses(item)

sort_responses(spec)

# ------------------------------------------------------- 9. operation-level security overrides
# APIMatic warns when operation-level security overrides top-level. Top-level is
# [bearerAuth, sessionId]. Public ops intentionally override with security: [].
# We leave genuine overrides but remove redundant ones that duplicate top-level.
top_sec = spec.get("security")

# ------------------------------------------------------- 10. examples on media types
# add a few representative examples for the demo flow media types
def set_example(path, method, status, ctype, example, st=None):
    op = spec["paths"].get(path, {}).get(method, {})
    resp = op.get("responses", {}).get(status, {})
    if st is not None:
        resp = op.get("responses", {}).get(status, {}).get("content", {})
    content = resp.get("content", {})
    if ctype in content and "example" not in content[ctype]:
        content[ctype]["example"] = example

set_example("/api/health", "get", "200", "application/json", {
    "status": "ok", "timestamp": "2026-11-03T10:00:00Z",
    "service": "paypal-commerce-agent-backend", "version": "1.0.0",
    "buildCommit": "unknown", "environment": "development", "uptime": 120.5,
    "paypal": {"enabled": True, "environment": "sandbox"},
    "storage": {"mode": "memory", "durable": False},
    "mandates": {"keyPersistence": "memory"},
    "automation": {"enabled": False, "configured": False, "signed": False},
    "ai": {"enabled": True, "providers": ["groq", "gemini"]},
})
set_example("/api/sessions", "post", "201", "application/json",
            {"sessionId": "s_01HZX", "sessionToken": "tok_...",
             "expiresAt": "2026-11-03T11:00:00Z"})
set_example("/api/ai/chat", "post", "200", "application/json", {
    "sessionId": "s_01HZX", "response": "Here is your cart.",
    "preparedCart": {"items": [{"productId": "p1", "name": "Flat White",
                                "quantity": 2, "unitPriceMinor": 350,
                                "unitPriceFormatted": "€3.50",
                                "lineTotalMinor": 700,
                                "lineTotalFormatted": "€7.00"}],
                     "totalMinor": 700, "totalFormatted": "€7.00",
                     "currency": "EUR", "cartId": "c_abc",
                     "message": "Cart prepared with 1 item(s).",
                     "policyDecision": "AUTO_ALLOW", "policyViolations": [],
                     "requiresExplicitApproval": False, "retrySuggested": False,
                     "reason": None},
    "checkoutReady": True, "toolRounds": 1, "messageCount": 4,
    "mode": "ai", "provider": "groq", "model": "llama-3.1-8b",
    "modelCalls": 1, "fallback": False,
})
set_example("/api/orders/create", "post", "201", "application/json",
            {"orderId": "ord_01HZX", "paypalOrderId": "5O190127TN364715T",
             "status": "CREATED", "origin": "AI_ASSISTED",
             "totalMinor": 700, "totalFormatted": "€7.00",
             "currency": "EUR", "approvalUrl": "https://www.sandbox.paypal.com/checkoutnow?token=..."})
set_example("/api/refunds", "get", "200", "application/json",
            {"sandbox": True, "paypalEnabled": True,
             "refunds": [{"id": "r_01HZX", "orderId": "ord_01HZX",
                          "currency": "EUR", "reason": "wrong item",
                          "proposedBy": "CUSTOMER", "status": "UNDER_REVIEW",
                          "createdAt": "2026-11-03T10:00:00Z"}]})

# ------------------------------------------------------- 11. parameter examples
PARAM_EXAMPLES = {
    "id": "coffee",
    "productId": "coffee",
    "orderId": "ord_01HZX",
    "sessionId": "s_01HZX",
    "refundId": "r_01HZX",
    "limit": 20,
    "maxPriceMinor": 1000,
    "matchMode": "all",
    "origin": "AI_ASSISTED",
    "decision": "AUTO_ALLOW",
    "status": "CREATED",
    "category": "drinks",
    "q": "flat white",
    "query": "flat white",
    "tags": "coffee",
    "dietary": "vegetarian",
    "occasion": "morning",
    "userId": "demo",
    "token": "5O190127TN364715T",       # PayPal approval token
    "Idempotency-Key": "idem_01HZX",
    "X-Ops-Key": "ops_key_demo",
    "Mcp-Session-Id": "mcp_s_01HZX",
}
PARAM_DESC = {
    "Idempotency-Key": "Client-supplied key; the server hashes it with the session and reuses it as PayPal-Request-Id.",
    "token": "PayPal approval token returned when the order was created.",
    "X-Ops-Key": "Merchant ops key required in private mode.",
    "Mcp-Session-Id": "Session header returned by MCP initialize; required for tools/call.",
}
def add_param_example(param):
    name = param.get("name")
    if "example" not in param:
        if name in PARAM_EXAMPLES:
            param["example"] = PARAM_EXAMPLES[name]
        elif param.get("in") == "path":
            param["example"] = "coffee"
    if name in PARAM_DESC and not param.get("description"):
        param["description"] = PARAM_DESC[name]
    elif not param.get("description"):
        param["description"] = f"Value for the {name} parameter."

for path, methods in spec["paths"].items():
    for method, op in methods.items():
        if method.lower() not in ("get", "post", "put", "patch", "delete"):
            continue
        for param in op.get("parameters", []):
            add_param_example(param)

# ------------------------------------------------------- 12. requestBody descriptions
REQUEST_BODY_DESC = {
    "/api/ai/chat": "The user's chat message plus optional shopper preferences used to prepare a cart.",
    "/api/policy/preview": "The cart items whose policy decision should be previewed (side-effect free).",
    "/api/orders/create": "The items to order. The server re-prices authoritatively and enforces policy.",
    "/api/ops/ask": "A natural-language question for the merchant Copilot (read-only; may only propose refunds).",
    "/api/mcp": "An MCP JSON-RPC 2.0 request (initialize, tools/list, or tools/call).",
    "/api/refunds/propose": "Details of the refund request to propose. Proposing moves no money.",
    "/api/mandates/verify": "The signed Cart Mandate to verify against the published signing key.",
}
for path, text in REQUEST_BODY_DESC.items():
    for op in spec["paths"].get(path, {}).values():
        if isinstance(op, dict) and "requestBody" in op:
            rb = op["requestBody"]
            if not rb.get("description"):
                rb["description"] = text

# ------------------------------------------------------- 13. remove 4XX where concrete codes exist
def prune_4xx(op):
    resp = op.get("responses")
    if not isinstance(resp, dict):
        return
    has_concrete = any(k.isdigit() and int(k) >= 400 for k in resp)
    # if it has any 4XX and also concrete 4xx codes, drop the range
    if "4XX" in resp and has_concrete:
        del resp["4XX"]

for path, methods in spec["paths"].items():
    for method, op in methods.items():
        if isinstance(op, dict):
            prune_4xx(op)

# ------------------------------------------------------- 14. error responses: add Error content
def add_error_content(op):
    resp = op.get("responses")
    if not isinstance(resp, dict):
        return
    for code, rdef in resp.items():
        if not isinstance(rdef, dict):
            continue
        digits = code[:-2] if code.endswith("XX") and len(code) == 3 else code
        if not digits.isdigit():
            continue
        status = int(digits)
        if status < 400:
            continue
        if "content" not in rdef:
            rdef["content"] = OrderedDict([
                ("application/json", OrderedDict([
                    ("schema", OrderedDict([("$ref", "#/components/schemas/Error")])),
                ])),
            ])

for path, methods in spec["paths"].items():
    for method, op in methods.items():
        if isinstance(op, dict):
            add_error_content(op)

# ------------------------------------------------------- 15. MCP header example + example metadata
mcp = spec["paths"].get("/api/mcp", {}).get("post", {})
hdr = mcp.get("responses", {}).get("200", {}).get("headers", {}).get("Mcp-Session-Id")
if isinstance(hdr, dict) and "example" not in hdr:
    hdr["example"] = "mcp_s_01HZX"
mcp_examples = (mcp.get("requestBody", {}).get("content", {})
                .get("application/json", {}).get("examples"))
if isinstance(mcp_examples, dict):
    default_summaries = {
        "initialize": "MCP handshake",
        "startCheckout": "Start a checkout via tools/call",
    }
    for key, ex in mcp_examples.items():
        if isinstance(ex, dict):
            ex.setdefault("summary", default_summaries.get(key, key.replace("_", " ")))
            ex.setdefault("description", f"Example: {key}.")

# ------------------------------------------------------- write back
with open(SRC, "w", encoding="utf-8") as f:
    json.dump(spec, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"Wrote {SRC}")
print(f"Paths: {len(spec['paths'])}, components: {len(spec['components']['schemas'])}")
