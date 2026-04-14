import type {
  ProjectContextResolver,
  ProjectServiceBinding,
} from "@srs/project-context";

interface ReadCandidateObjectRecord {
  id: string;
  projectKey: string;
  env: string;
}

interface ReadLocationPrisma {
  objectStorageLocation: {
    findFirst(args: {
      where: {
        objectId: string;
        locationRole: string;
        status: string;
      };
      orderBy: {
        createdAt: "desc";
      };
    }): Promise<{
      bindingId: string;
    } | null>;
    findMany(args: {
      where: {
        objectId: string;
        status: string;
        locationRole: {
          in: string[];
        };
      };
      orderBy: {
        createdAt: "desc";
      };
    }): Promise<Array<{
      bindingId: string;
    }>>;
  };
  projectServiceBinding: {
    findUnique(args: {
      where: {
        id: string;
      };
    }): Promise<ProjectServiceBinding | null>;
  };
}

export async function resolveCandidateReadBindings(
  objectRecord: ReadCandidateObjectRecord,
  prisma: ReadLocationPrisma,
  resolver: ProjectContextResolver,
): Promise<ProjectServiceBinding[]> {
  const candidates: ProjectServiceBinding[] = [];

  const addBindingById = async (bindingId: string) => {
    if (candidates.some((binding) => binding.id === bindingId)) {
      return;
    }

    const binding = await prisma.projectServiceBinding.findUnique({
      where: { id: bindingId },
    });

    if (binding) {
      candidates.push(binding);
    }
  };

  const primaryLocation = await prisma.objectStorageLocation.findFirst({
    where: {
      objectId: objectRecord.id,
      locationRole: "primary",
      status: "active",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (primaryLocation) {
    await addBindingById(primaryLocation.bindingId);
  }

  const secondaryLocations = await prisma.objectStorageLocation.findMany({
    where: {
      objectId: objectRecord.id,
      status: "active",
      locationRole: {
        in: ["replica", "fallback"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  for (const location of secondaryLocations) {
    await addBindingById(location.bindingId);
  }

  const ctx = await resolver.resolve(
    objectRecord.projectKey,
    objectRecord.env,
    "object_storage",
  );

  if (!candidates.some((binding) => binding.id === ctx.binding.id)) {
    candidates.push(ctx.binding);
  }

  return candidates;
}
