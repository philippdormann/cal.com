import { lookup } from "dns";

import { sendAdminOrganizationNotification } from "@calcom/emails";
import { RESERVED_SUBDOMAINS, WEBAPP_URL } from "@calcom/lib/constants";
import { createDomain } from "@calcom/lib/domainManager/organization";
import { getTranslation } from "@calcom/lib/server/i18n";
import { OrganizationRepository } from "@calcom/lib/server/repository/organization";
import { prisma } from "@calcom/prisma";
import { UserPermissionRole } from "@calcom/prisma/enums";

import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../trpc";
import type { TCreateInputSchema } from "./create.schema";

type CreateOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TCreateInputSchema;
};

const getIPAddress = async (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    lookup(url, (err, address) => {
      if (err) reject(err);
      resolve(address);
    });
  });
};

export const createHandler = async ({ input, ctx }: CreateOptions) => {
  const { slug, name, adminEmail: orgOwnerEmail, adminUsername: orgOwnerUsername, check } = input;

  const orgOwner = await prisma.user.findUnique({
    where: {
      email: orgOwnerEmail,
    },
  });

  const hasAnOrgWithSameSlug = await prisma.team.findFirst({
    where: {
      slug: slug,
      parentId: null,
      metadata: {
        path: ["isOrganization"],
        equals: true,
      },
    },
  });

  // Allow creating an organization with same requestedSlug as a non-org Team's slug
  // It is needed so that later we can migrate the non-org Team(with the conflicting slug) to the newly created org
  // Publishing the organization would fail if the team with the same slug is not migrated first

  if (hasAnOrgWithSameSlug || RESERVED_SUBDOMAINS.includes(slug))
    throw new TRPCError({ code: "BAD_REQUEST", message: "organization_url_taken" });

  if (orgOwner) {
    // Invite existing user as the owner of the organization
  } else {
    // Create a new user and invite them as the owner of the organization
    throw new Error("Inviting a new user to be the owner of the organization is not supported yet");
  }

  const t = await getTranslation(ctx.user.locale ?? "en", "common");
  let isOrganizationConfigured = false;

  isOrganizationConfigured = await createDomain(slug);

  if (!isOrganizationConfigured) {
    // Otherwise, we proceed to send an administrative email to admins regarding
    // the need to configure DNS registry to support the newly created org
    const instanceAdmins = await prisma.user.findMany({
      where: { role: UserPermissionRole.ADMIN },
      select: { email: true },
    });
    if (instanceAdmins.length) {
      await sendAdminOrganizationNotification({
        instanceAdmins,
        orgSlug: slug,
        ownerEmail: orgOwnerEmail,
        webappIPAddress: await getIPAddress(
          WEBAPP_URL.replace("https://", "")?.replace("http://", "").replace(/(:.*)/, "")
        ),
        t,
      });
    } else {
      console.warn("Organization created: subdomain not configured and couldn't notify adminnistrators");
    }
  }

  const organization = await OrganizationRepository.createWithOwner({
    orgData: {
      name,
      slug,
      isOrganizationConfigured,
      autoAcceptEmail: true,
    },
    owner: {
      id: orgOwner.id,
      email: orgOwnerEmail,
      username: orgOwnerUsername,
    },
  });

  if (!organization.id) throw Error("User not created");

  return { user: { ...orgOwner, organizationId: organization.id } };

  // Sync Services: Close.com
  //closeComUpsertOrganizationUser(createTeam, ctx.user, MembershipRole.OWNER);
};

export default createHandler;
