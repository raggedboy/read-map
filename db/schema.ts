import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mapDocuments = sqliteTable("map_documents", {
  path: text("path").primaryKey(),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const resources = sqliteTable("resources", {
  path: text("path").primaryKey(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Immutable receipts for safely retrying an already-committed Inbox promotion.
export const mapOperations = sqliteTable("map_operations", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
});

// Recoverable Inbox deletions. Backups and receipts are retained after restore.
export const mapInboxDeletions = sqliteTable("map_inbox_deletions", {
  id: text("id").primaryKey(),
  inboxVersion: integer("inbox_version").notNull(),
  itemIndex: integer("item_index").notNull(),
  item: text("item").notNull(),
  inboxBackup: text("inbox_backup").notNull(),
  createdAt: text("created_at").notNull(),
  restoreInboxVersion: integer("restore_inbox_version"),
  restoredAt: text("restored_at"),
});
