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
