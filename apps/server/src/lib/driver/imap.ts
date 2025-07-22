// @ts-ignore – imapflow has no bundled types in the current tree but will be installed as a dependency
import { ImapFlow, ImapFlowOptions } from 'imapflow';
// @ts-ignore – after dependency install the types will resolve
import { simpleParser, Attachment, ParsedMail } from 'mailparser';
import type { MailManager, ManagerConfig } from './types';
import type { ParsedMessage, Label } from '../../types';
// ParsedMessageSchema not needed here; removed unused import.

// NOTE: This driver is **experimental** and currently supports a
// minimal subset of the MailManager interface focused on read-only
// operations needed by the existing TRPC routers: list (threads),
// get (single message), count (folder counts), markAsRead / markAsUnread,
// modifyLabels (star/archive/flag).  Other methods return
// a NotImplemented error placeholder so the application compiles while
// we iterate.

/** Helper to decode a Base64 string that encodes "username:password" */
function decodeUserPass(b64: string | undefined): { user: string; pass: string } {
  if (!b64) return { user: '', pass: '' };
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    const [user, pass] = decoded.split(':');
    return { user, pass };
  } catch (err) {
    return { user: '', pass: '' };
  }
}

/** Convert a mailparser ParsedMail to our internal ParsedMessage shape */
function parsedMailToParsedMessage(parsed: ParsedMail): ParsedMessage {
  const attachments = (parsed.attachments || []).map((a: Attachment) => ({
    filename: a.filename || '',
    mimeType: a.contentType || 'application/octet-stream',
    size: a.size || 0,
    id: a.checksum || a.cid || a.filename || '',
  }));
  return {
    id: parsed.messageId || '',
    threadId: parsed.messageId || '',
    historyId: null,
    from: parsed.from?.value || [],
    to: parsed.to?.value || [],
    cc: parsed.cc?.value || [],
    bcc: parsed.bcc?.value || [],
    subject: parsed.subject || '',
    date: parsed.date?.toISOString() || new Date().toISOString(),
    snippet: (parsed.text || '').substring(0, 120),
    body: parsed.text || '',
    processedHtml: parsed.html || '',
    totalReplies: 0,
    tags: [],
    attachments,
  } as unknown as ParsedMessage; // TODO: refine mapping
}

export class ImapMailManager implements MailManager {
  private imap: ImapFlow;
  private connectionPromise: Promise<void>;
  private serverConfig: { host: string; port: number; tls: boolean };
  private user: string;

  constructor(public config: ManagerConfig & { serverConfig?: { host: string; port: number; tls: boolean } }) {
    // Fallback defaults – these should be supplied by caller via extra
    // serverConfig property.
    this.serverConfig = (config as any).serverConfig ?? { host: '', port: 993, tls: true };

    const { user, pass } = decodeUserPass(config.auth?.accessToken);
    this.user = user || config.auth?.email || '';

    const opts: ImapFlowOptions = {
      host: this.serverConfig.host,
      port: this.serverConfig.port,
      secure: this.serverConfig.tls,
      auth: {
        user: this.user,
        pass: pass,
      },
    } as ImapFlowOptions;

    this.imap = new ImapFlow(opts as any);
    this.connectionPromise = this.imap.connect();
  }

  /* Utility --------------------------------------------------------- */
  private async ensureMailbox(mailbox = 'INBOX') {
    await this.connectionPromise;
    if (this.imap.mailbox?.name !== mailbox) {
      await this.imap.mailboxOpen(mailbox, { readOnly: false });
    }
  }

  /* --- MailManager mandatory -------------------------------------- */
  public async list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }): Promise<{ threads: { id: string; historyId: string | null }[]; nextPageToken: string | null }> {
    const { folder = 'INBOX', maxResults = 50, pageToken } = params;
    await this.ensureMailbox(folder);

    // Simple listing: newest first based on UID.
    const searchCriteria: any = { all: true };
    // TODO: add query mapping when needed

    const uids = await this.imap.search(searchCriteria, { uid: true });
    // Sort descending (newest first)
    const sorted: number[] = [...uids].sort((a: number, b: number) => b - a);

    let startIndex = 0;
    if (pageToken) {
      const idx = sorted.findIndex((uid: number) => uid === Number(pageToken));
      startIndex = idx >= 0 ? idx + 1 : 0;
    }

    const slice: number[] = sorted.slice(startIndex, startIndex + maxResults);

    const threads = slice.map((uid: number) => ({ id: String(uid), historyId: null }));
    const nextPage = slice.length === maxResults ? String(slice[slice.length - 1]) : null;

    return { threads, nextPageToken: nextPage };
  }

  public async get(id: string) {
    await this.ensureMailbox();
    const uid: number = Number(id);
    const message = await this.imap.fetchOne(uid, { source: true });
    if (!message || !message.source) throw new Error('Message not found');

    const parsed = await simpleParser(message.source as Buffer);
    const parsedMsg = parsedMailToParsedMessage(parsed);

    return {
      messages: [parsedMsg],
      latest: parsedMsg,
      hasUnread: !(message.flags || []).includes('\\Seen'),
      totalReplies: 0,
      labels: [{ id: 'INBOX', name: 'INBOX' }],
    };
  }

  public async count() {
    // For first pass, return basic INBOX counts only.
    await this.ensureMailbox('INBOX');
    const status = await this.imap.status('INBOX');
    return [
      { label: 'INBOX', count: status.exists || 0 },
    ];
  }

  public async markAsRead(ids: string[]) {
    await this.ensureMailbox();
    const uids: number[] = ids.map(Number);
    await this.imap.messageFlagsAdd({ uid: uids }, ['\\Seen']);
  }

  public async markAsUnread(ids: string[]) {
    await this.ensureMailbox();
    const uids: number[] = ids.map(Number);
    await this.imap.messageFlagsRemove({ uid: uids }, ['\\Seen']);
  }

  public normalizeIds(ids: string[]) {
    return { threadIds: ids };
  }

  public async modifyLabels(ids: string[], options: { addLabels: string[]; removeLabels: string[] }) {
    // Basic starred / important mapping.
    await this.ensureMailbox();
    const uids: number[] = ids.map(Number);
    if (options.addLabels?.includes('STARRED')) {
      await this.imap.messageFlagsAdd({ uid: uids }, ['\\Flagged']);
    }
    if (options.removeLabels?.includes('STARRED')) {
      await this.imap.messageFlagsRemove({ uid: uids }, ['\\Flagged']);
    }
  }

  public async getUserLabels(): Promise<Label[]> {
    // IMAP mailboxes listed at top level.
    await this.connectionPromise;
    const boxes = await this.imap.list();
    return boxes.map((box: any) => ({
      id: box.path,
      name: box.path,
      type: 'system',
      color: undefined,
    }));
  }

  public async getLabel(id: string): Promise<Label> {
    return { id, name: id, type: 'system', color: undefined } as Label;
  }

  public async getEmailAliases(): Promise<{ email: string; name?: string | undefined; primary?: boolean | undefined }[]> {
    return [{ email: this.user, primary: true }];
  }

  /* --- Not yet implemented but required by interface -------------- */
  public async create(): Promise<{ id?: string | null }> {
    throw new Error('create not implemented for ImapMailManager yet');
  }
  public async sendDraft(): Promise<void> {
    throw new Error('sendDraft not implemented for ImapMailManager yet');
  }
  public async createDraft(): Promise<{ id?: string | null; success?: boolean; error?: string }> {
    throw new Error('createDraft not implemented for ImapMailManager yet');
  }
  public async getDraft(): Promise<any> {
    throw new Error('getDraft not implemented for ImapMailManager yet');
  }
  public async listDrafts(): Promise<{ threads: { id: string; historyId: string | null; $raw: unknown }[]; nextPageToken: string | null }> {
    return { threads: [], nextPageToken: null };
  }
  public async delete(): Promise<void> {
    throw new Error('delete not implemented for ImapMailManager yet');
  }
  public async getTokens(): Promise<any> {
    throw new Error('getTokens not applicable for ImapMailManager');
  }
  public async getUserInfo() {
    return { address: this.user, name: this.user, photo: '' };
  }
  public getScope(): string {
    return '';
  }
  public async listHistory() {
    return { history: [], historyId: '' };
  }
  public async getAttachment() {
    return undefined;
  }
  public async createLabel() {
    throw new Error('createLabel not implemented');
  }
  public async updateLabel() {
    throw new Error('updateLabel not implemented');
  }
  public async deleteLabel() {
    throw new Error('deleteLabel not implemented');
  }
  public async revokeToken() {
    return true;
  }
  public async deleteAllSpam() {
    return { success: false, message: 'Not implemented', error: 'Not implemented', count: 0 };
  }
} 