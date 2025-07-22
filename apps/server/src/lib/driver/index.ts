import type { MailManager, ManagerConfig } from './types';
import { OutlookMailManager } from './microsoft';
import { GoogleMailManager } from './google';
import { ImapMailManager } from './imap';

const supportedProviders: Record<string, new (config: ManagerConfig) => MailManager> = {
  google: GoogleMailManager as unknown as new (config: ManagerConfig) => MailManager,
  microsoft: OutlookMailManager as unknown as new (config: ManagerConfig) => MailManager,
  imap: ImapMailManager as unknown as new (config: ManagerConfig) => MailManager,
};

export const createDriver = (
  provider: keyof typeof supportedProviders | (string & {}),
  config: ManagerConfig,
): MailManager => {
  const Provider = supportedProviders[provider as keyof typeof supportedProviders];
  if (!Provider) throw new Error('Provider not supported');
  return new Provider(config);
};
