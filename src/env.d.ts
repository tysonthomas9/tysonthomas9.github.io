interface ImportMetaEnv {
  /** Cloudflare Web Analytics beacon token. Empty = no analytics. */
  readonly PUBLIC_CF_BEACON_TOKEN?: string;
  /** Kit form ID for the newsletter signup. Empty = no form. */
  readonly PUBLIC_KIT_FORM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
