import { telemetrySettingsSchema } from "../telemetry/schema";

import { z } from "zod";

import { i18nSettingsSchema } from "../i18n/schema";
import { loggerSettingsSchema } from "../logger/schema";
import { authSettingsSchema } from "../middleware/auth/schema";
import { landingSettingsSchema } from "../modules/landing/schema";
import { visioSettingsSchema } from "../modules/visio/schema";
import { wellKnownSettingsSchema } from "../modules/well-known/schema";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 3000;
const MIN_ALLOWED_PORT = 1;
const MAX_ALLOWED_PORT = 65535;
const DEFAULT_TRUST_X_FORWARDED_FOR = false;

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 100;

const DEFAULT_DB_SSL = false;
const DEFAULT_DB_VACUUM_DELAY = 3600;

const DEFAULT_HASH_RATE_LIMIT = 100;
const DEFAULT_HASH_KEY_DELAY = 3600;
const DEFAULT_HASH_KEYS_DEPTH = 5;
const DEFAULT_HASH_PEPPER_CRON = "0 0 * * *";

const DEFAULT_SMTP_PORT = 587;
const DEFAULT_SENDER_LOCALPART = "twake";
const DEFAULT_LINK_EXPIRY = 3600;

const DEFAULT_LDAP_UID_FIELD = "uid";
const DEFAULT_LDAP_SYNC_CRON = "*/10 * * * *";

const DEFAULT_CACHE_ENGINE = "memory";
const DEFAULT_CACHE_TTL = 3600;

const DEFAULT_SMS_API_URL = "https://api.octopush.com/v1/public";

const DEFAULT_FEDERATION_SYNC_CRON = "*/10 * * * *";

const DEFAULT_JWT_ALGORITHM = "HS256";

const DEFAULT_TWAKE_CHAT_APP_NAME = "Twake Chat";
const DEFAULT_TWAKE_CHAT_MAX_AVATAR_SIZE = "";

const DEFAULT_VISIBILITY = "private";

const DEFAULT_CREATEROOM_PROXY_ENABLED = false;
const DEFAULT_CREATEROOM_PROXY_MAX_RETRIES = 3;
const DEFAULT_CREATEROOM_PROXY_NUKE_ROOM = true;
const DEFAULT_CREATEROOM_PROXY_DEFAULT_PRESET = "private_chat";
const DEFAULT_CREATEROOM_PROXY_ENCRYPTION = "allowed" as const;

const DEFAULT_CREATEROOM_PROXY_IS_DIRECT_MASK = {
  ban: 100,
  invite: 100,
  kick: 100,
  redact: 100,
  state_default: 100,
  users_default: 10,
  creator_becomes: 10,
};

const DEFAULT_CORS_ENABLED = true;
const DEFAULT_CORS_CREDENTIALS = false; // Wildcard in origin is not compatible with this being true by specs.
const DEFAULT_CORS_ALLOW_NO_ORIGIN: boolean = false; // Control whether or not to block requests without origin (e.g. mobile apps)
const DEFAULT_CORS_ORIGINS: string[] = [
  "*",
];
const DEFAULT_CORS_METHODS: string[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
  "PATCH",
];
const DEFAULT_CORS_ALLOWED_HEADERS: string[] = [
  "Origin",
  "X-Requested-With",
  "Content-Type",
  "Accept",
  "Authorization",
  "X-Request-Id",
];

const DEFAULT_CREATEROOM_PROXY_PRESETS = [
  {
    name: "trusted_private_chat",
    default_visibility: "private" as "private",
    allow_is_direct: true,
    users_default: 10,
    events_default: 10,
    invite: 10,
    state_default: 100,
    kick: 10,
    ban: 10,
    redact: 10,
    creator_becomes: 10,
    notifications: {
      room: 10,
    },
    events: {
      "m.reaction": 10,
      "m.room.redaction": 10,
      "m.room.pinned_events": 10,
      "org.matrix.msc3401.call": 10,
      "org.matrix.msc3401.call.member": 10,
      "m.room.name": 10,
      "m.room.topic": 10,
      "m.room.avatar": 10,
      "m.room.server_acl": 10,
      "m.room.tombstone": 10,
      "m.room.history_visibility": 10,
      "m.room.power_levels": 10,
      "m.room.encryption": 10,
    },
  },
  {
    name: "private_chat",
    default_visibility: "private" as "private",
    allow_is_direct: true,
    users_default: 10,
    events_default: 10,
    invite: 10,
    state_default: 90,
    kick: 50,
    ban: 50,
    redact: 50,
    creator_becomes: 90,
    notifications: {
      room: 10,
    },
    events: {
      "m.reaction": 10,
      "m.room.redaction": 10,
      "m.room.pinned_events": 10,
      "org.matrix.msc3401.call": 10,
      "org.matrix.msc3401.call.member": 10,
      "m.room.name": 80,
      "m.room.topic": 80,
      "m.room.avatar": 80,
      "m.room.server_acl": 80,
      "m.room.tombstone": 80,
      "m.room.history_visibility": 80,
      "m.room.power_levels": 80,
      "m.room.encryption": 90,
    },
  },
  {
    name: "public_chat",
    default_visibility: "public" as "public",
    allow_is_direct: false,
    users_default: 10,
    events_default: 10,
    invite: 0,
    state_default: 90,
    kick: 50,
    ban: 50,
    redact: 50,
    creator_becomes: 90,
    notifications: {
      room: 10,
    },
    events: {
      "m.reaction": 10,
      "m.room.redaction": 10,
      "m.room.pinned_events": 50,
      "org.matrix.msc3401.call": 50,
      "org.matrix.msc3401.call.member": 10,
      "m.room.name": 80,
      "m.room.topic": 80,
      "m.room.avatar": 80,
      "m.room.server_acl": 80,
      "m.room.tombstone": 80,
      "m.room.history_visibility": 80,
      "m.room.power_levels": 80,
      "m.room.encryption": 100,
    },
  },
  {
    name: "private_channel",
    synapse_preset: "private_chat",
    default_visibility: "private" as "private",
    allow_is_direct: false,
    users_default: 10,
    events_default: 80,
    invite: 50,
    state_default: 90,
    kick: 50,
    ban: 50,
    redact: 80,
    creator_becomes: 90,
    notifications: {
      room: 80,
    },
    events: {
      "m.reaction": 10,
      "m.room.redaction": 80,
      "m.room.pinned_events": 50,
      "org.matrix.msc3401.call": 100,
      "org.matrix.msc3401.call.member": 100,
      "m.room.name": 80,
      "m.room.topic": 80,
      "m.room.avatar": 80,
      "m.room.server_acl": 80,
      "m.room.tombstone": 80,
      "m.room.history_visibility": 90,
      "m.room.power_levels": 50,
      "m.room.encryption": 90,
    },
  },
  {
    name: "public_channel",
    synapse_preset: "public_chat",
    default_visibility: "public" as "public",
    allow_is_direct: false,
    users_default: 10,
    events_default: 80,
    invite: 0,
    state_default: 90,
    kick: 50,
    ban: 50,
    redact: 80,
    creator_becomes: 90,
    notifications: {
      room: 80,
    },
    events: {
      "m.reaction": 10,
      "m.room.redaction": 80,
      "m.room.pinned_events": 50,
      "org.matrix.msc3401.call": 100,
      "org.matrix.msc3401.call.member": 100,
      "m.room.name": 80,
      "m.room.topic": 80,
      "m.room.avatar": 80,
      "m.room.server_acl": 80,
      "m.room.tombstone": 80,
      "m.room.history_visibility": 100,
      "m.room.power_levels": 50,
      "m.room.encryption": 100,
    },
  },
];

const databaseSettingsSchema: z.ZodObject<{"host": z.ZodString; "name": z.ZodString; "user": z.ZodString; "password": z.ZodString; "ssl": z.ZodDefault<z.ZodBoolean>; "vacuum_delay": z.ZodDefault<z.ZodNumber>}> = z.object({
  host: z.string(),
  name: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.boolean().default(DEFAULT_DB_SSL),
  vacuum_delay: z.number().default(DEFAULT_DB_VACUUM_DELAY),
});

const rateLimitingSchema: z.ZodObject<{"window_ms": z.ZodDefault<z.ZodNumber>; "max_requests": z.ZodDefault<z.ZodNumber>}> = z.object({
  window_ms: z.number().default(DEFAULT_RATE_LIMIT_WINDOW_MS),
  max_requests: z.number().default(DEFAULT_RATE_LIMIT_MAX_REQUESTS),
});

const synapseAdminSchema: z.ZodObject<{"login": z.ZodDefault<z.ZodOptional<z.ZodString>>; "password": z.ZodDefault<z.ZodOptional<z.ZodString>>; "access_token": z.ZodDefault<z.ZodString>}> = z.object({
  login: z.string().optional().default(""),
  password: z.string().optional().default(""),
  access_token: z.string().default(""),
});

const commonSettingsSchema: z.ZodObject<{"enabled": z.ZodDefault<z.ZodBoolean>; "application_url": z.ZodDefault<z.ZodString>}> = z.object({
  enabled: z.boolean().default(false),
  application_url: z.string().default(""),
});

const defaultVisibilitySettingsSchema: z.ZodObject<{"visibility": z.ZodDefault<z.ZodString>; "visible_fields": z.ZodDefault<z.ZodArray<z.ZodString>>}> = z.object({
  visibility: z.string().default(DEFAULT_VISIBILITY),
  visible_fields: z.array(z.string()).default([]),
});

const userProfileSchema: z.ZodObject<{"default_visibility_settings": z.ZodPrefault<typeof defaultVisibilitySettingsSchema>}> = z.object({
  default_visibility_settings: defaultVisibilitySettingsSchema.prefault({}),
});

const userDirectorySchema: z.ZodObject<{"enabled": z.ZodDefault<z.ZodBoolean>}> = z.object({
  enabled: z.boolean().default(false),
});

const createroomProxyFailureSchema: z.ZodObject<{"max_retries": z.ZodDefault<z.ZodNumber>; "nuke_room": z.ZodDefault<z.ZodBoolean>}> = z.object({
  max_retries: z.number().default(DEFAULT_CREATEROOM_PROXY_MAX_RETRIES),
  nuke_room: z.boolean().default(DEFAULT_CREATEROOM_PROXY_NUKE_ROOM),
});

const directChatMaskSchema: z.ZodObject<{"ban": z.ZodOptional<z.ZodNumber>; "invite": z.ZodOptional<z.ZodNumber>; "kick": z.ZodOptional<z.ZodNumber>; "redact": z.ZodOptional<z.ZodNumber>; "state_default": z.ZodOptional<z.ZodNumber>; "users_default": z.ZodOptional<z.ZodNumber>; "creator_becomes": z.ZodOptional<z.ZodNumber>; "events": z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>}> = z.object({
  ban: z.number().optional(),
  invite: z.number().optional(),
  kick: z.number().optional(),
  redact: z.number().optional(),
  state_default: z.number().optional(),
  users_default: z.number().optional(),
  creator_becomes: z.number().optional(),
  events: z.record(z.string(), z.number()).optional(),
});

const presetConfigSchema: z.ZodObject<{"name": z.ZodString; "users_default": z.ZodDefault<z.ZodNumber>; "events_default": z.ZodDefault<z.ZodNumber>; "invite": z.ZodDefault<z.ZodNumber>; "state_default": z.ZodDefault<z.ZodNumber>; "kick": z.ZodDefault<z.ZodNumber>; "ban": z.ZodDefault<z.ZodNumber>; "redact": z.ZodDefault<z.ZodNumber>; "notifications": z.ZodDefault<z.ZodObject<{"room": z.ZodNumber}>>; "events": z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>; "users": z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>; "creator_becomes": z.ZodOptional<z.ZodNumber>; "synapse_preset": z.ZodOptional<z.ZodString>; "default_visibility": z.ZodOptional<z.ZodEnum<{"public": "public"; "private": "private"}>>; "allow_is_direct": z.ZodOptional<z.ZodBoolean>}> = z.object({
  name: z.string(),
  users_default: z.number().default(0),
  events_default: z.number().default(0),
  invite: z.number().default(0),
  state_default: z.number().default(50),
  kick: z.number().default(50),
  ban: z.number().default(50),
  redact: z.number().default(50),
  notifications: z
    .object({
      room: z.number(),
    })
    .default({
      room: 20,
    }),
  events: z.record(z.string(), z.number()).default({}),
  users: z.record(z.string(), z.number()).optional(),
  creator_becomes: z.number().optional(),
  synapse_preset: z.string().optional(),
  default_visibility: z
    .enum([
      "public",
      "private",
    ])
    .optional(),
  allow_is_direct: z.boolean().optional(),
});

const createroomProxySchema: z.ZodObject<{"enabled": z.ZodDefault<z.ZodBoolean>; "on_failure": z.ZodPrefault<typeof createroomProxyFailureSchema>; "default_preset": z.ZodDefault<z.ZodString>; "encryption": z.ZodDefault<z.ZodEnum<{"allowed": "allowed"; "enforced": "enforced"; "disabled": "disabled"}>>; "is_direct_mask": z.ZodDefault<typeof directChatMaskSchema>; "presets": z.ZodDefault<z.ZodArray<typeof presetConfigSchema>>}> = z.object({
  enabled: z.boolean().default(DEFAULT_CREATEROOM_PROXY_ENABLED),
  on_failure: createroomProxyFailureSchema.prefault({}),
  default_preset: z.string().default(DEFAULT_CREATEROOM_PROXY_DEFAULT_PRESET),
  encryption: z
    .enum([
      "allowed",
      "enforced",
      "disabled",
    ])
    .default(DEFAULT_CREATEROOM_PROXY_ENCRYPTION),
  is_direct_mask: directChatMaskSchema.default(DEFAULT_CREATEROOM_PROXY_IS_DIRECT_MASK),
  presets: z.array(presetConfigSchema).default(DEFAULT_CREATEROOM_PROXY_PRESETS),
});

const corsSettingsSchema: z.ZodObject<{"enabled": z.ZodDefault<z.ZodBoolean>; "allow_no_origin": z.ZodDefault<z.ZodBoolean>; "origins": z.ZodDefault<z.ZodArray<z.ZodString>>; "credentials": z.ZodDefault<z.ZodBoolean>; "methods": z.ZodDefault<z.ZodArray<z.ZodString>>; "allowed_headers": z.ZodDefault<z.ZodArray<z.ZodString>>; "exposed_headers": z.ZodOptional<z.ZodArray<z.ZodString>>; "max_age": z.ZodOptional<z.ZodNumber>}> = z
  .object({
    enabled: z.boolean().default(DEFAULT_CORS_ENABLED),
    allow_no_origin: z.boolean().default(DEFAULT_CORS_ALLOW_NO_ORIGIN),
    origins: z.array(z.string()).default(DEFAULT_CORS_ORIGINS),
    credentials: z.boolean().default(DEFAULT_CORS_CREDENTIALS),
    methods: z.array(z.string()).default(DEFAULT_CORS_METHODS),
    allowed_headers: z.array(z.string()).default(DEFAULT_CORS_ALLOWED_HEADERS),
    exposed_headers: z.array(z.string()).optional(),
    max_age: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.credentials && value.origins.includes("*")) {
      ctx.addIssue({
        code: "custom",
        path: [
          "origins",
        ],
        message: "cors.credentials cannot be enabled when cors.origin contains '*'",
      });
    }

    for (const [index, origin] of value.origins.entries()) {
      if (!origin.startsWith("~")) {
        continue;
      }

      try {
        new RegExp(origin.slice(1));
      } catch {
        ctx.addIssue({
          code: "custom",
          path: [
            "origins",
            index,
          ],
          message: "cors.origins regex rules must be valid regular expressions",
        });
      }
    }
  });

const serverSettingsSchema: z.ZodObject<{"name": z.ZodString; "base_url": z.ZodDefault<z.ZodString>; "host": z.ZodDefault<z.ZodString>; "port": z.ZodDefault<z.ZodNumber>; "trust_x_forwarded_for": z.ZodDefault<z.ZodBoolean>; "trusted_proxies": z.ZodDefault<z.ZodArray<z.ZodString>>; "additional_features": z.ZodDefault<z.ZodBoolean>; "enable_cron_jobs": z.ZodDefault<z.ZodBoolean>; "rate_limiting": z.ZodPrefault<typeof rateLimitingSchema>}> = z.object({
  name: z.string(), // REQUIRED
  base_url: z.string().default(""),
  host: z.string().default(DEFAULT_HOST),
  port: z.number().int().min(MIN_ALLOWED_PORT).max(MAX_ALLOWED_PORT).default(DEFAULT_PORT),
  trust_x_forwarded_for: z.boolean().default(DEFAULT_TRUST_X_FORWARDED_FOR),
  trusted_proxies: z.array(z.string()).default([]),
  additional_features: z.boolean().default(false),
  enable_cron_jobs: z.boolean().default(false),
  rate_limiting: rateLimitingSchema.prefault({}),
});

const urlsSettingsSchema: z.ZodObject<{"signup": z.ZodDefault<z.ZodString>; "chat": z.ZodDefault<z.ZodString>; "auth": z.ZodDefault<z.ZodString>; "qr_code": z.ZodDefault<z.ZodString>; "invitation_redirect": z.ZodDefault<z.ZodString>}> = z.object({
  signup: z.string().default(""),
  chat: z.string().default(""),
  auth: z.string().default(""),
  qr_code: z.string().default(""),
  invitation_redirect: z.string().default(""),
});

const synapseSettingsSchema: z.ZodObject<{"server_url": z.ZodDefault<z.ZodOptional<z.ZodURL>>; "internal_host": z.ZodDefault<z.ZodOptional<z.ZodString>>; "admin": z.ZodOptional<typeof synapseAdminSchema>; "database": z.ZodOptional<typeof databaseSettingsSchema>}> = z.object({
  server_url: z.url().optional().default(""),
  internal_host: z.string().optional().default(""),
  admin: synapseAdminSchema.optional(),
  database: databaseSettingsSchema.optional(),
});

const hashSettingsSchema: z.ZodObject<{"rate_limit": z.ZodDefault<z.ZodNumber>; "key_delay": z.ZodDefault<z.ZodNumber>; "keys_depth": z.ZodDefault<z.ZodNumber>; "pepper_cron": z.ZodDefault<z.ZodString>}> = z.object({
  rate_limit: z.number().default(DEFAULT_HASH_RATE_LIMIT),
  key_delay: z.number().default(DEFAULT_HASH_KEY_DELAY),
  keys_depth: z.number().default(DEFAULT_HASH_KEYS_DEPTH),
  pepper_cron: z.string().default(DEFAULT_HASH_PEPPER_CRON),
});

const invitationsSettingsSchema: z.ZodObject<{"server_name": z.ZodDefault<z.ZodString>}> = z.object({
  server_name: z.string().default("matrix.to"),
});

const termsSettingsSchema: z.ZodObject<{"policies": z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>}> = z.object({
  policies: z.record(z.string(), z.unknown()).optional(),
});

const emailSettingsSchema: z.ZodObject<{"smtp_host": z.ZodDefault<z.ZodOptional<z.ZodString>>; "smtp_port": z.ZodDefault<z.ZodNumber>; "tls": z.ZodDefault<z.ZodBoolean>; "username": z.ZodOptional<z.ZodString>; "password": z.ZodOptional<z.ZodString>; "sender": z.ZodOptional<z.ZodString>; "sender_localpart": z.ZodDefault<z.ZodString>; "verify_certificate": z.ZodDefault<z.ZodBoolean>; "templates_dir": z.ZodDefault<z.ZodString>; "link_expiry": z.ZodDefault<z.ZodNumber>}> = z.object({
  smtp_host: z.string().optional().default(""),
  smtp_port: z.number().int().default(DEFAULT_SMTP_PORT),
  tls: z.boolean().default(true),
  username: z.string().optional(),
  password: z.string().optional(),
  sender: z.string().optional(),
  sender_localpart: z.string().default(DEFAULT_SENDER_LOCALPART),
  verify_certificate: z.boolean().default(true),
  templates_dir: z.string().default(""),
  link_expiry: z.number().default(DEFAULT_LINK_EXPIRY),
});

const ldapSettingsSchema: z.ZodObject<{"uri": z.ZodOptional<z.ZodString>; "base": z.ZodOptional<z.ZodString>; "user": z.ZodOptional<z.ZodString>; "password": z.ZodOptional<z.ZodString>; "filter": z.ZodOptional<z.ZodString>; "uid_field": z.ZodDefault<z.ZodString>; "sync_cron": z.ZodDefault<z.ZodString>; "client_options": z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>}> = z.object({
  uri: z.string().optional(),
  base: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  filter: z.string().optional(),
  uid_field: z.string().default(DEFAULT_LDAP_UID_FIELD),
  sync_cron: z.string().default(DEFAULT_LDAP_SYNC_CRON),
  client_options: z.record(z.string(), z.unknown()).optional(),
});

const cacheSettingsSchema: z.ZodObject<{"engine": z.ZodDefault<z.ZodEnum<{"memory": "memory"; "redis": "redis"}>>; "ttl": z.ZodDefault<z.ZodNumber>; "redis_uri": z.ZodOptional<z.ZodString>}> = z.object({
  engine: z
    .enum([
      "memory",
      "redis",
    ])
    .default(DEFAULT_CACHE_ENGINE as "memory" | "redis"),
  ttl: z.number().default(DEFAULT_CACHE_TTL),
  redis_uri: z.string().optional(),
});

const smsSettingsSchema: z.ZodObject<{"api_url": z.ZodDefault<z.ZodURL>; "api_login": z.ZodOptional<z.ZodString>; "api_key": z.ZodOptional<z.ZodString>}> = z.object({
  api_url: z.url().default(DEFAULT_SMS_API_URL),
  api_login: z.string().optional(),
  api_key: z.string().optional(),
});

const federationSettingsSchema: z.ZodObject<{"is_federated_identity_service": z.ZodDefault<z.ZodBoolean>; "trusted_servers_addresses": z.ZodDefault<z.ZodArray<z.ZodString>>; "identity_services": z.ZodDefault<z.ZodArray<z.ZodString>>; "sync_cron": z.ZodDefault<z.ZodString>}> = z.object({
  is_federated_identity_service: z.boolean().default(false),
  trusted_servers_addresses: z.array(z.string()).default([]),
  identity_services: z.array(z.string()).default([]),
  sync_cron: z.string().default(DEFAULT_FEDERATION_SYNC_CRON),
});

const jitsiSettingsSchema: z.ZodObject<{"base_url": z.ZodDefault<z.ZodString>; "use_jwt": z.ZodDefault<z.ZodBoolean>; "jwt_secret": z.ZodOptional<z.ZodString>; "jwt_issuer": z.ZodOptional<z.ZodString>; "jwt_algorithm": z.ZodDefault<z.ZodString>; "preferred_domain": z.ZodOptional<z.ZodString>}> = z.object({
  base_url: z.string().default(""),
  use_jwt: z.boolean().default(false),
  jwt_secret: z.string().optional(),
  jwt_issuer: z.string().optional(),
  jwt_algorithm: z.string().default(DEFAULT_JWT_ALGORITHM),
  preferred_domain: z.string().optional(),
});

const oidcSettingsSchema: z.ZodObject<{"issuer": z.ZodOptional<z.ZodString>}> = z.object({
  issuer: z.string().optional(),
});

const twakeChatSettingsSchema: z.ZodObject<{"application_name": z.ZodDefault<z.ZodString>; "application_welcome_message": z.ZodDefault<z.ZodString>; "privacy_url": z.ZodDefault<z.ZodString>; "render_html": z.ZodDefault<z.ZodBoolean>; "hide_redacted_events": z.ZodDefault<z.ZodBoolean>; "hide_unknown_events": z.ZodDefault<z.ZodBoolean>; "issue_id": z.ZodDefault<z.ZodString>; "registration_url": z.ZodDefault<z.ZodString>; "twake_workplace_homeserver": z.ZodDefault<z.ZodString>; "app_grid_dashboard_available": z.ZodDefault<z.ZodBoolean>; "platform": z.ZodDefault<z.ZodString>; "default_max_upload_avatar_size_in_bytes": z.ZodDefault<z.ZodString>; "dev_mode": z.ZodDefault<z.ZodBoolean>; "qr_code_download_url": z.ZodDefault<z.ZodString>; "enable_logs": z.ZodDefault<z.ZodBoolean>; "support_url": z.ZodDefault<z.ZodString>; "enable_invitations": z.ZodDefault<z.ZodBoolean>}> = z.object({
  application_name: z.string().default(DEFAULT_TWAKE_CHAT_APP_NAME),
  application_welcome_message: z.string().default(""),
  privacy_url: z.string().default(""),
  render_html: z.boolean().default(true),
  hide_redacted_events: z.boolean().default(false),
  hide_unknown_events: z.boolean().default(true),
  issue_id: z.string().default(""),
  registration_url: z.string().default(""),
  twake_workplace_homeserver: z.string().default(""),
  app_grid_dashboard_available: z.boolean().default(false),
  platform: z.string().default(""),
  default_max_upload_avatar_size_in_bytes: z.string().default(DEFAULT_TWAKE_CHAT_MAX_AVATAR_SIZE),
  dev_mode: z.boolean().default(false),
  qr_code_download_url: z.string().default(""),
  enable_logs: z.boolean().default(false),
  support_url: z.string().default(""),
  enable_invitations: z.boolean().default(false),
});

const featuresSettingsSchema: z.ZodObject<{"common_settings": z.ZodPrefault<typeof commonSettingsSchema>; "matrix_profile_updates_allowed": z.ZodDefault<z.ZodBoolean>; "user_profile": z.ZodPrefault<typeof userProfileSchema>; "user_directory": z.ZodPrefault<typeof userDirectorySchema>; "createroom_proxy": z.ZodOptional<typeof createroomProxySchema>}> = z.object({
  common_settings: commonSettingsSchema.prefault({}),
  matrix_profile_updates_allowed: z.boolean().default(true),
  user_profile: userProfileSchema.prefault({}),
  user_directory: userDirectorySchema.prefault({}),
  createroom_proxy: createroomProxySchema.optional(),
});

// Required modules (No prefault!)
const serverConfigSchema: z.ZodObject<{"server": typeof serverSettingsSchema}> = z.object({
  server: serverSettingsSchema,
});
const synapseConfigSchema: z.ZodObject<{"synapse": z.ZodPrefault<typeof synapseSettingsSchema>}> = z.object({
  synapse: synapseSettingsSchema.prefault({}),
});
const databaseConfigSchema: z.ZodObject<{"database": typeof databaseSettingsSchema}> = z.object({
  database: databaseSettingsSchema,
});
const emailConfigSchema: z.ZodObject<{"email": z.ZodPrefault<typeof emailSettingsSchema>}> = z.object({
  email: emailSettingsSchema.prefault({}),
});

// Optional modules (Prefault passes empty object down)
const urlsConfigSchema: z.ZodObject<{"urls": z.ZodPrefault<typeof urlsSettingsSchema>}> = z.object({
  urls: urlsSettingsSchema.prefault({}),
});
const hashConfigSchema: z.ZodObject<{"hash": z.ZodPrefault<typeof hashSettingsSchema>}> = z.object({
  hash: hashSettingsSchema.prefault({}),
});
const invitationsConfigSchema: z.ZodObject<{"invitations": z.ZodPrefault<typeof invitationsSettingsSchema>}> = z.object({
  invitations: invitationsSettingsSchema.prefault({}),
});
const termsConfigSchema: z.ZodObject<{"terms": z.ZodPrefault<typeof termsSettingsSchema>}> = z.object({
  terms: termsSettingsSchema.prefault({}),
});
const ldapConfigSchema: z.ZodObject<{"ldap": z.ZodPrefault<typeof ldapSettingsSchema>}> = z.object({
  ldap: ldapSettingsSchema.prefault({}),
});
const cacheConfigSchema: z.ZodObject<{"cache": z.ZodPrefault<typeof cacheSettingsSchema>}> = z.object({
  cache: cacheSettingsSchema.prefault({}),
});
const smsConfigSchema: z.ZodObject<{"sms": z.ZodPrefault<typeof smsSettingsSchema>}> = z.object({
  sms: smsSettingsSchema.prefault({}),
});
const federationConfigSchema: z.ZodObject<{"federation": z.ZodPrefault<typeof federationSettingsSchema>}> = z.object({
  federation: federationSettingsSchema.prefault({}),
});
const jitsiConfigSchema: z.ZodObject<{"jitsi": z.ZodPrefault<typeof jitsiSettingsSchema>}> = z.object({
  jitsi: jitsiSettingsSchema.prefault({}),
});
const oidcConfigSchema: z.ZodObject<{"oidc": z.ZodPrefault<typeof oidcSettingsSchema>}> = z.object({
  oidc: oidcSettingsSchema.prefault({}),
});
const twakeChatConfigSchema: z.ZodObject<{"twake_chat": z.ZodPrefault<typeof twakeChatSettingsSchema>}> = z.object({
  twake_chat: twakeChatSettingsSchema.prefault({}),
});
const featuresConfigSchema: z.ZodObject<{"features": z.ZodPrefault<typeof featuresSettingsSchema>}> = z.object({
  features: featuresSettingsSchema.prefault({}),
});

const loggerConfigSchema: z.ZodObject<{"logger": z.ZodPrefault<typeof loggerSettingsSchema>}> = z.object({
  logger: loggerSettingsSchema.prefault({}),
});
const i18nConfigSchema: z.ZodObject<{"i18n": z.ZodPrefault<typeof i18nSettingsSchema>}> = z.object({
  i18n: i18nSettingsSchema.prefault({}),
});
const telemetryConfigSchema: z.ZodObject<{"telemetry": z.ZodPrefault<typeof telemetrySettingsSchema>}> = z.object({
  telemetry: telemetrySettingsSchema.prefault({}),
});

const corsConfigSchema: z.ZodObject<{"cors": z.ZodPrefault<typeof corsSettingsSchema>}> = z.object({
  cors: corsSettingsSchema.prefault({}),
});

const landingConfigSchema: z.ZodObject<{"landing": z.ZodPrefault<typeof landingSettingsSchema>}> = z.object({
  landing: landingSettingsSchema.prefault({}),
});

const wellKnownConfigSchema: z.ZodObject<{"well_known": z.ZodPrefault<typeof wellKnownSettingsSchema>}> = z.object({
  well_known: wellKnownSettingsSchema.prefault({}),
});

const authConfigSchema: z.ZodObject<{"auth": z.ZodPrefault<typeof authSettingsSchema>}> = z.object({
  auth: authSettingsSchema.prefault({}),
});

const visioConfigSchema: z.ZodObject<{"visio": z.ZodPrefault<typeof visioSettingsSchema>}> = z.object({
  visio: visioSettingsSchema.prefault({}),
});

// Keep the public declaration exact without asking isolatedDeclarations to
// serialize the inference of every nested Zod constructor. Each intersection
// retains the concrete field schemas (including defaults and prefault input).
type ConfigShape =
  & typeof serverConfigSchema.shape
  & typeof corsConfigSchema.shape
  & typeof urlsConfigSchema.shape
  & typeof synapseConfigSchema.shape
  & typeof databaseConfigSchema.shape
  & typeof hashConfigSchema.shape
  & typeof invitationsConfigSchema.shape
  & typeof termsConfigSchema.shape
  & typeof emailConfigSchema.shape
  & typeof ldapConfigSchema.shape
  & typeof cacheConfigSchema.shape
  & typeof smsConfigSchema.shape
  & typeof federationConfigSchema.shape
  & typeof jitsiConfigSchema.shape
  & typeof oidcConfigSchema.shape
  & typeof twakeChatConfigSchema.shape
  & typeof featuresConfigSchema.shape
  & typeof loggerConfigSchema.shape
  & typeof i18nConfigSchema.shape
  & typeof telemetryConfigSchema.shape
  & typeof landingConfigSchema.shape
  & typeof wellKnownConfigSchema.shape
  & typeof authConfigSchema.shape
  & typeof visioConfigSchema.shape;

export const configSchema: z.ZodObject<ConfigShape> = z.object({
  ...serverConfigSchema.shape,
  ...corsConfigSchema.shape,
  ...urlsConfigSchema.shape,
  ...synapseConfigSchema.shape,
  ...databaseConfigSchema.shape,
  ...hashConfigSchema.shape,
  ...invitationsConfigSchema.shape,
  ...termsConfigSchema.shape,
  ...emailConfigSchema.shape,
  ...ldapConfigSchema.shape,
  ...cacheConfigSchema.shape,
  ...smsConfigSchema.shape,
  ...federationConfigSchema.shape,
  ...jitsiConfigSchema.shape,
  ...oidcConfigSchema.shape,
  ...twakeChatConfigSchema.shape,
  ...featuresConfigSchema.shape,

  ...loggerConfigSchema.shape,
  ...i18nConfigSchema.shape,
  ...telemetryConfigSchema.shape,

  ...landingConfigSchema.shape,
  ...wellKnownConfigSchema.shape,
  ...authConfigSchema.shape,
  ...visioConfigSchema.shape,
});
