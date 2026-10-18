// src/legacy/schema.ts
import { z } from "zod";

// ==========================================
// 1. Reusable Sub-schemas
// ==========================================

const connectionOptionsSchema: z.ZodUnion<readonly [z.ZodBoolean, z.ZodRecord<z.ZodString, z.ZodUnknown>]> = z.union([
  z.boolean(),
  z.record(z.string(), z.unknown()),
]);

const powerLevelEventsSchema: z.ZodObject<{"m.reaction": z.ZodNumber; "m.room.redaction": z.ZodNumber; "m.room.pinned_events": z.ZodNumber; "org.matrix.msc3401.call": z.ZodNumber; "org.matrix.msc3401.call.member": z.ZodNumber; "m.room.name": z.ZodNumber; "m.room.topic": z.ZodNumber; "m.room.avatar": z.ZodNumber; "m.room.history_visibility": z.ZodNumber; "m.room.power_levels": z.ZodNumber; "m.room.encryption": z.ZodNumber; "m.room.server_acl": z.ZodOptional<z.ZodNumber>; "m.room.tombstone": z.ZodOptional<z.ZodNumber>}> = z.object({
  "m.reaction": z.number(),
  "m.room.redaction": z.number(),
  "m.room.pinned_events": z.number(),
  "org.matrix.msc3401.call": z.number(),
  "org.matrix.msc3401.call.member": z.number(),
  "m.room.name": z.number(),
  "m.room.topic": z.number(),
  "m.room.avatar": z.number(),
  "m.room.history_visibility": z.number(),
  "m.room.power_levels": z.number(),
  "m.room.encryption": z.number(),
  "m.room.server_acl": z.number().optional(),
  "m.room.tombstone": z.number().optional(),
});

const directChatMaskSchema: z.ZodObject<{"ban": z.ZodOptional<z.ZodNumber>; "invite": z.ZodOptional<z.ZodNumber>; "kick": z.ZodOptional<z.ZodNumber>; "redact": z.ZodOptional<z.ZodNumber>; "state_default": z.ZodOptional<z.ZodNumber>; "users_default": z.ZodOptional<z.ZodNumber>; "creator_becomes": z.ZodOptional<z.ZodNumber>; "events": z.ZodOptional<z.ZodObject<{[K in keyof typeof powerLevelEventsSchema.shape]: z.ZodOptional<(typeof powerLevelEventsSchema.shape)[K]>}>>}> = z.object({
  ban: z.number().optional(),
  invite: z.number().optional(),
  kick: z.number().optional(),
  redact: z.number().optional(),
  state_default: z.number().optional(),
  users_default: z.number().optional(),
  creator_becomes: z.number().optional(),
  events: powerLevelEventsSchema.partial().optional(),
});

const presetConfigSchema: z.ZodObject<{"name": z.ZodString; "users_default": z.ZodNumber; "events_default": z.ZodNumber; "invite": z.ZodNumber; "state_default": z.ZodNumber; "kick": z.ZodNumber; "ban": z.ZodNumber; "redact": z.ZodNumber; "notifications": z.ZodObject<{"room": z.ZodNumber}>; "events": typeof powerLevelEventsSchema; "users": z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>; "creator_becomes": z.ZodOptional<z.ZodNumber>; "synapse_preset": z.ZodOptional<z.ZodString>; "default_visibility": z.ZodOptional<z.ZodEnum<{"public": "public"; "private": "private"}>>; "allow_is_direct": z.ZodOptional<z.ZodBoolean>}> = z.object({
  name: z.string(),
  users_default: z.number(),
  events_default: z.number(),
  invite: z.number(),
  state_default: z.number(),
  kick: z.number(),
  ban: z.number(),
  redact: z.number(),
  notifications: z.object({
    room: z.number(),
  }),
  events: powerLevelEventsSchema,
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

const twakeChatEnvSchema: z.ZodObject<{"application_name": z.ZodString; "application_welcome_message": z.ZodString; "privacy_url": z.ZodString; "render_html": z.ZodBoolean; "hide_redacted_events": z.ZodBoolean; "hide_unknown_events": z.ZodBoolean; "issue_id": z.ZodString; "registration_url": z.ZodString; "twake_workplace_homeserver": z.ZodString; "app_grid_dashboard_available": z.ZodBoolean; "platform": z.ZodString; "default_max_upload_avatar_size_in_bytes": z.ZodString; "dev_mode": z.ZodBoolean; "qr_code_download_url": z.ZodString; "enable_logs": z.ZodBoolean; "support_url": z.ZodString; "enable_invitations": z.ZodBoolean}> = z.object({
  application_name: z.string(),
  application_welcome_message: z.string(),
  privacy_url: z.string(),
  render_html: z.boolean(),
  hide_redacted_events: z.boolean(),
  hide_unknown_events: z.boolean(),
  issue_id: z.string(),
  registration_url: z.string(),
  twake_workplace_homeserver: z.string(),
  app_grid_dashboard_available: z.boolean(),
  platform: z.string(),
  default_max_upload_avatar_size_in_bytes: z.string(),
  dev_mode: z.boolean(),
  qr_code_download_url: z.string(),
  enable_logs: z.boolean(),
  support_url: z.string(),
  enable_invitations: z.boolean(),
});

// ==========================================
// 2. Feature-specific Sub-schemas
// ==========================================

const commonSettingsSchema: z.ZodObject<{"enabled": z.ZodBoolean; "application_url": z.ZodString}> = z.object({
  enabled: z.boolean(),
  application_url: z.string(),
});

const defaultVisibilitySettingsSchema: z.ZodObject<{"visibility": z.ZodString; "visible_fields": z.ZodArray<z.ZodString>}> = z.object({
  visibility: z.string(),
  visible_fields: z.array(z.string()),
});

const userProfileSchema: z.ZodObject<{"default_visibility_settings": typeof defaultVisibilitySettingsSchema}> = z.object({
  default_visibility_settings: defaultVisibilitySettingsSchema,
});

const userDirectorySchema: z.ZodObject<{"enabled": z.ZodBoolean}> = z.object({
  enabled: z.boolean(),
});

const createroomProxyFailureSchema: z.ZodObject<{"max_retries": z.ZodOptional<z.ZodNumber>; "nuke_room": z.ZodOptional<z.ZodBoolean>}> = z.object({
  max_retries: z.number().optional(),
  nuke_room: z.boolean().optional(),
});

const createroomProxySchema: z.ZodObject<{"enabled": z.ZodOptional<z.ZodBoolean>; "on_failure": z.ZodOptional<typeof createroomProxyFailureSchema>; "default_preset": z.ZodOptional<z.ZodString>; "encryption": z.ZodOptional<z.ZodEnum<{"allowed": "allowed"; "enforced": "enforced"; "disabled": "disabled"}>>; "is_direct_mask": z.ZodOptional<typeof directChatMaskSchema>; "presets": z.ZodOptional<z.ZodArray<typeof presetConfigSchema>>}> = z.object({
  enabled: z.boolean().optional(),
  on_failure: createroomProxyFailureSchema.optional(),
  default_preset: z.string().optional(),
  encryption: z
    .enum([
      "allowed",
      "enforced",
      "disabled",
    ])
    .optional(),
  is_direct_mask: directChatMaskSchema.optional(),
  presets: z.array(presetConfigSchema).optional(),
});

const featuresSchema: z.ZodObject<{"common_settings": typeof commonSettingsSchema; "matrix_profile_updates_allowed": z.ZodBoolean; "user_profile": typeof userProfileSchema; "user_directory": typeof userDirectorySchema; "createroom_proxy": z.ZodOptional<typeof createroomProxySchema>}> = z.object({
  common_settings: commonSettingsSchema,
  matrix_profile_updates_allowed: z.boolean(),
  user_profile: userProfileSchema,
  user_directory: userDirectorySchema,
  createroom_proxy: createroomProxySchema.optional(),
});

// ==========================================
// 3. Flat Legacy Config Sections
// ==========================================

const serverConfigSchema: z.ZodObject<{"additional_features": z.ZodOptional<z.ZodBoolean>; "base_url": z.ZodString; "cron_service": z.ZodBoolean; "rate_limiting_window": z.ZodOptional<z.ZodNumber>; "rate_limiting_nb_requests": z.ZodOptional<z.ZodNumber>; "server_name": z.ZodString; "trust_x_forwarded_for": z.ZodOptional<z.ZodBoolean>}> = z.object({
  additional_features: z.boolean().optional(),
  base_url: z.string(),
  cron_service: z.boolean(),
  rate_limiting_window: z.number().optional(),
  rate_limiting_nb_requests: z.number().optional(),
  server_name: z.string(),
  trust_x_forwarded_for: z.boolean().optional(),
});

const urlsConfigSchema: z.ZodObject<{"signup_url": z.ZodString; "chat_url": z.ZodOptional<z.ZodString>; "auth_url": z.ZodOptional<z.ZodString>; "qr_code_url": z.ZodOptional<z.ZodString>; "invitation_redirect_url": z.ZodOptional<z.ZodString>}> = z.object({
  signup_url: z.string(),
  chat_url: z.string().optional(),
  auth_url: z.string().optional(),
  qr_code_url: z.string().optional(),
  invitation_redirect_url: z.string().optional(),
});

const synapseConfigSchema: z.ZodObject<{"matrix_server": z.ZodDefault<z.ZodString>; "matrix_internal_host": z.ZodDefault<z.ZodString>; "matrix_admin_login": z.ZodDefault<z.ZodString>; "matrix_admin_password": z.ZodDefault<z.ZodString>; "admin_access_token": z.ZodDefault<z.ZodString>; "matrix_database_engine": z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodLiteral<"pg">>>>; "matrix_database_host": z.ZodDefault<z.ZodString>; "matrix_database_name": z.ZodOptional<z.ZodNullable<z.ZodString>>; "matrix_database_password": z.ZodOptional<z.ZodNullable<z.ZodString>>; "matrix_database_ssl": z.ZodOptional<typeof connectionOptionsSchema>; "matrix_database_user": z.ZodOptional<z.ZodNullable<z.ZodString>>}> = z.object({
  matrix_server: z.string().default(""),
  matrix_internal_host: z.string().default(""),
  matrix_admin_login: z.string().default(""),
  matrix_admin_password: z.string().default(""),
  admin_access_token: z.string().default(""),
  matrix_database_engine: z.literal("pg").nullable().optional().default("pg"),
  matrix_database_host: z.string().default(""),
  matrix_database_name: z.string().nullable().optional(),
  matrix_database_password: z.string().nullable().optional(),
  matrix_database_ssl: connectionOptionsSchema.optional(),
  matrix_database_user: z.string().nullable().optional(),
});

const databaseConfigSchema: z.ZodObject<{"database_engine": z.ZodDefault<z.ZodLiteral<"pg">>; "database_host": z.ZodString; "database_name": z.ZodOptional<z.ZodString>; "database_password": z.ZodOptional<z.ZodString>; "database_ssl": z.ZodOptional<typeof connectionOptionsSchema>; "database_user": z.ZodOptional<z.ZodString>; "database_vacuum_delay": z.ZodNumber}> = z.object({
  database_engine: z.literal("pg").default("pg"),
  database_host: z.string(),
  database_name: z.string().optional(),
  database_password: z.string().optional(),
  database_ssl: connectionOptionsSchema.optional(),
  database_user: z.string().optional(),
  database_vacuum_delay: z.number(),
});

const hashConfigSchema: z.ZodObject<{"hashes_rate_limit": z.ZodOptional<z.ZodNumber>; "key_delay": z.ZodNumber; "keys_depth": z.ZodNumber; "pepperCron": z.ZodOptional<z.ZodString>}> = z.object({
  hashes_rate_limit: z.number().optional(),
  key_delay: z.number(),
  keys_depth: z.number(),
  pepperCron: z.string().optional(),
});

const invitationsConfigSchema: z.ZodObject<{"invitation_server_name": z.ZodOptional<z.ZodString>}> = z.object({
  invitation_server_name: z.string().optional(),
});

const termsConfigSchema: z.ZodObject<{"policies": z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodString]>>>}> = z.object({
  policies: z
    .union([
      z.record(z.string(), z.unknown()),
      z.string(),
    ])
    .nullable()
    .optional(),
});

const emailConfigSchema: z.ZodObject<{"mail_link_delay": z.ZodDefault<z.ZodNumber>; "smtp_password": z.ZodOptional<z.ZodString>; "smtp_port": z.ZodOptional<z.ZodNumber>; "smtp_sender": z.ZodOptional<z.ZodString>; "smtp_server": z.ZodDefault<z.ZodString>; "smtp_tls": z.ZodOptional<z.ZodBoolean>; "smtp_user": z.ZodOptional<z.ZodString>; "smtp_verify_certificate": z.ZodOptional<z.ZodBoolean>; "template_dir": z.ZodDefault<z.ZodString>; "sender_localpart": z.ZodDefault<z.ZodString>}> = z.object({
  mail_link_delay: z.number().default(7200),
  smtp_password: z.string().optional(),
  smtp_port: z.number().optional(),
  smtp_sender: z.string().optional(),
  smtp_server: z.string().default(""),
  smtp_tls: z.boolean().optional(),
  smtp_user: z.string().optional(),
  smtp_verify_certificate: z.boolean().optional(),
  template_dir: z.string().default(""),
  sender_localpart: z.string().default("twake"),
});

const ldapConfigSchema: z.ZodObject<{"ldap_filter": z.ZodOptional<z.ZodString>; "ldap_base": z.ZodOptional<z.ZodString>; "ldap_password": z.ZodOptional<z.ZodString>; "ldap_uri": z.ZodOptional<z.ZodString>; "ldap_user": z.ZodOptional<z.ZodString>; "ldap_uid_field": z.ZodOptional<z.ZodString>; "ldapts_opts": z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>; "update_users_cron": z.ZodOptional<z.ZodString>; "userdb_engine": z.ZodNullable<z.ZodLiteral<"ldap">>; "userdb_host": z.ZodOptional<z.ZodString>; "userdb_name": z.ZodOptional<z.ZodString>; "userdb_password": z.ZodOptional<z.ZodString>; "userdb_ssl": z.ZodOptional<typeof connectionOptionsSchema>; "userdb_user": z.ZodOptional<z.ZodString>}> = z.object({
  ldap_filter: z.string().optional(),
  ldap_base: z.string().optional(),
  ldap_password: z.string().optional(),
  ldap_uri: z.string().optional(),
  ldap_user: z.string().optional(),
  ldap_uid_field: z.string().optional(),
  ldapts_opts: z.record(z.string(), z.unknown()).optional(),
  update_users_cron: z.string().optional(),
  userdb_engine: z.literal("ldap").nullable(),
  userdb_host: z.string().optional(),
  userdb_name: z.string().optional(),
  userdb_password: z.string().optional(),
  userdb_ssl: connectionOptionsSchema.optional(),
  userdb_user: z.string().optional(),
});

const cacheConfigSchema: z.ZodObject<{"cache_engine": z.ZodOptional<z.ZodString>; "cache_ttl": z.ZodOptional<z.ZodNumber>; "redis_uri": z.ZodOptional<z.ZodString>}> = z.object({
  cache_engine: z.string().optional(),
  cache_ttl: z.number().optional(),
  redis_uri: z.string().optional(),
});

const smsConfigSchema: z.ZodObject<{"sms_api_login": z.ZodOptional<z.ZodString>; "sms_api_key": z.ZodOptional<z.ZodString>; "sms_api_url": z.ZodOptional<z.ZodString>}> = z.object({
  sms_api_login: z.string().optional(),
  sms_api_key: z.string().optional(),
  sms_api_url: z.string().optional(),
});

const federationConfigSchema: z.ZodObject<{"federated_identity_services": z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString>>>; "is_federated_identity_service": z.ZodBoolean; "trusted_servers_addresses": z.ZodArray<z.ZodString>; "update_federated_identity_hashes_cron": z.ZodOptional<z.ZodString>}> = z.object({
  federated_identity_services: z.array(z.string()).nullable().optional(),
  is_federated_identity_service: z.boolean(),
  trusted_servers_addresses: z.array(z.string()),
  update_federated_identity_hashes_cron: z.string().optional(),
});

const jitsiConfigSchema: z.ZodObject<{"jitsiBaseUrl": z.ZodString; "jitsiJwtAlgorithm": z.ZodString; "jitsiJwtIssuer": z.ZodString; "jitsiJwtSecret": z.ZodString; "jitsiPreferredDomain": z.ZodString; "jitsiUseJwt": z.ZodBoolean}> = z.object({
  jitsiBaseUrl: z.string(),
  jitsiJwtAlgorithm: z.string(),
  jitsiJwtIssuer: z.string(),
  jitsiJwtSecret: z.string(),
  jitsiPreferredDomain: z.string(),
  jitsiUseJwt: z.boolean(),
});

const oidcConfigSchema: z.ZodObject<{"oidc_issuer": z.ZodOptional<z.ZodString>}> = z.object({
  oidc_issuer: z.string().optional(),
});

// ==========================================
// 4. Final Aggregated Legacy Config
// ==========================================

type LegacyConfigShape =
  & typeof serverConfigSchema.shape
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
  & { twake_chat: typeof twakeChatEnvSchema; features: typeof featuresSchema };

export const legacyConfigSchema: z.ZodObject<LegacyConfigShape> = z.object({
  ...serverConfigSchema.shape,
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

  twake_chat: twakeChatEnvSchema,
  features: featuresSchema,
});
