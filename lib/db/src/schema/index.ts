import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";

export const walletBackupsTable = pgTable("wallet_backups", {
  accountHash: text("account_hash").primaryKey(),
  encryptedPk: text("encrypted_pk").notNull(),
  address:     text("address").notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
});

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id:          serial("id").primaryKey(),
  address:     text("address").notNull(),
  endpoint:    text("endpoint").notNull().unique(),
  p256dh:      text("p256dh").notNull(),
  auth:        text("auth").notNull(),
  lastSeenTx:  text("last_seen_tx"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});