ALTER TABLE "team_role" ADD COLUMN "color" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Every role that is there already gets a tint: the colours of src/lib/role-colors.ts in
-- their order, by the role's place in its team, so the roles of one team differ.
UPDATE "team_role" AS t
SET "color" = (ARRAY['sky','peach','mint','lilac','sand','rose','aqua','sage','coral','periwinkle','orchid','slate'])[(1 + ((x.rn - 1) % 12))::int]
FROM (SELECT "id", row_number() OVER (PARTITION BY "manager_id" ORDER BY "sort", "name", "id") AS rn FROM "team_role") AS x
WHERE x."id" = t."id";
