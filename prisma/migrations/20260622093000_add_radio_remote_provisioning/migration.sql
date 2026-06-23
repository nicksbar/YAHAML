-- AlterTable
ALTER TABLE "radio_connections" ADD COLUMN "remoteSshHost" TEXT;
ALTER TABLE "radio_connections" ADD COLUMN "remoteSshPort" INTEGER;
ALTER TABLE "radio_connections" ADD COLUMN "remoteSshUser" TEXT;
ALTER TABLE "radio_connections" ADD COLUMN "remoteSshPublicKey" TEXT;
ALTER TABLE "radio_connections" ADD COLUMN "remoteSshPrivateKeyPath" TEXT;
ALTER TABLE "radio_connections" ADD COLUMN "remoteProvisionedAt" DATETIME;
ALTER TABLE "radio_connections" ADD COLUMN "remoteProvisionStatus" TEXT;
ALTER TABLE "radio_connections" ADD COLUMN "remoteProvisionLastError" TEXT;
