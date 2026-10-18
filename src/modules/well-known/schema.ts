import { z } from "zod";

type BaseUrlShape = {
  base_url: z.ZodURL;
};
type TomServerShape = BaseUrlShape & {
  server_name: z.ZodString;
};
type FederatedServicesShape = {
  base_urls: z.ZodArray<z.ZodURL>;
};

const wellKnownHomeserverSchema: z.ZodObject<BaseUrlShape> = z.object({
  base_url: z.url({
    normalize: true,
  }),
});

const wellKnownIdentityServerSchema: z.ZodObject<BaseUrlShape> = z.object({
  base_url: z.url({
    normalize: true,
  }),
});

const wellKnownTomServerSchema: z.ZodObject<TomServerShape> = z.object({
  base_url: z.url({
    normalize: true,
  }),
  server_name: z.string(),
});

const wellKnownFederatedIdentityServicesSchema: z.ZodObject<FederatedServicesShape> = z.object({
  base_urls: z.array(
    z.url({
      normalize: true,
    }),
  ),
});

type ClientWellKnownShape = {
  enabled: z.ZodDefault<z.ZodBoolean>;
  extra: z.ZodOptional<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
  homeserver: z.ZodOptional<z.ZodObject<BaseUrlShape>>;
  identityserver: z.ZodOptional<z.ZodObject<BaseUrlShape>>;
  tomserver: z.ZodOptional<z.ZodObject<TomServerShape>>;
  federatedIdentityServices: z.ZodOptional<z.ZodObject<FederatedServicesShape>>;
};

export const wellKnownClientSettingsSchema: z.ZodObject<ClientWellKnownShape> = z.object({
  enabled: z.boolean().default(false),
  extra: z.record(z.string(), z.unknown()).default({}).optional(),

  homeserver: wellKnownHomeserverSchema.optional(),
  identityserver: wellKnownIdentityServerSchema.optional(),
  tomserver: wellKnownTomServerSchema.optional(),
  federatedIdentityServices: wellKnownFederatedIdentityServicesSchema.optional(),
});

type WellKnownSettingsShape = {
  client: z.ZodPrefault<z.ZodObject<Pick<ClientWellKnownShape, "enabled" | "extra">>>;
};

export const wellKnownSettingsSchema: z.ZodObject<WellKnownSettingsShape> = z.object({
  client: wellKnownClientSettingsSchema
    .pick({
      enabled: true,
      extra: true,
    })
    .prefault({}),
});

type ClientDocumentShape = {
  "m.homeserver": z.ZodOptional<z.ZodObject<BaseUrlShape>>;
  "m.identity_server": z.ZodOptional<z.ZodObject<BaseUrlShape>>;
  "t.server": z.ZodOptional<z.ZodObject<TomServerShape>>;
  "m.federated_identity_services": z.ZodOptional<z.ZodObject<FederatedServicesShape>>;
};

export const wellKnownClientDocumentSchema: z.ZodObject<ClientDocumentShape, z.core.$catchall<z.ZodUnknown>> = z
  .object({
    "m.homeserver": wellKnownHomeserverSchema.optional(),
    "m.identity_server": wellKnownIdentityServerSchema.optional(),
    "t.server": wellKnownTomServerSchema.optional(),
    "m.federated_identity_services": wellKnownFederatedIdentityServicesSchema.optional(),
  })
  .catchall(z.unknown());
