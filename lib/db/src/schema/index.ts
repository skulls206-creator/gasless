import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const walletBackupsTable = pgTable("wallet_backups", {
  accountHash: text("account_hash").primaryKey(),
  encryptedPk: text("encrypted_pk").notNull(),
  address:     text("address").notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
});