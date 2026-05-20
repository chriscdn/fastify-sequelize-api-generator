import sjs from "sequelize-json-schema";
import { camelCase, pascalCase } from "change-case";
import get from "lodash.get";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import type { ModelStatic, Model, Attributes } from "sequelize";
import type { JSONSchema7 } from "json-schema";

type Variation = "" | "post" | "patch";

type AddModelSchemaParams<M extends Model> = {
  fastify: FastifyInstance;
  Model: ModelStatic<M>;
  exclude?: (keyof Attributes<M>)[];
  readOnly?: (keyof Attributes<M>)[];
  writeOnly?: (keyof Attributes<M>)[];
};

// Internal mapping, do not use directly
type Operation =
  | "RETRIEVE"
  | "LIST"
  | "CREATE"
  | "UPDATE_PATCH"
  | "UPDATE_PUT"
  | "DESTROY";

type APIParams<I extends Model, L extends Model = I> = {
  prefix?: string;
  // params?: Record<string, any>;
  params?: JSONSchema7;
  fastify: FastifyInstance;

  Model: ModelStatic<any>; // important

  genericView: Operation[];

  preHandler?: preHandlerHookHandler[];

  hasPermission?: (request: FastifyRequest) => Promise<boolean>;

  hasObjectPermission?: (
    request: FastifyRequest,
    instance: I,
  ) => Promise<boolean>;

  // the database look up field, which is used in the getObject call
  lookupField?: string;

  // lookupUrlParam refers to the url `/:parameter`, which is used in the getObject call
  lookupUrlParam?: string;

  getObject?: (request: FastifyRequest) => Promise<I | null>;
  getObjects?: (request: FastifyRequest) => Promise<L[]>;

  tags?: string[];
  descriptions?: Partial<Record<Operation, string>>;
  operationIds?: Partial<Record<Operation, string>>;

  performCreate?: (request: FastifyRequest, instance: I) => Promise<any>;
  performUpdate?: (request: FastifyRequest, instance: I) => Promise<any>;
  performDestroy?: (request: FastifyRequest, instance: I) => Promise<any>;

  responseSchema?: any;
};

const FastifySequelizeGenericViews: Record<string, Operation[]> = {
  ListAPIView: ["LIST"],
  ListCreateAPIView: ["LIST", "CREATE"],
  RetrieveAPIView: ["RETRIEVE"],
  CreateAPIView: ["CREATE"],
  UpdateAPIView: ["UPDATE_PATCH", "UPDATE_PUT"],
  RetrieveUpdateDestroyAPIView: [
    "RETRIEVE",
    "UPDATE_PATCH",
    "UPDATE_PUT",
    "DESTROY",
  ],
} as const;

const FastifyGetSchemaName = (
  Model: ModelStatic<Model>,
  variation: Variation = "",
) => pascalCase(`${Model.name} ${variation}`);

const FastifyAddModelSchema = <M extends Model>({
  fastify,
  Model,
  exclude = [],
  readOnly = [],
  writeOnly = [],
}: AddModelSchemaParams<M>): void => {
  const schemaNameOut = FastifyGetSchemaName(Model, "");
  const schemaNamePost = FastifyGetSchemaName(Model, "post");
  const schemaNamePatch = FastifyGetSchemaName(Model, "patch");

  const schemaGet = fastify.getSchema(schemaNameOut);
  const schemaPost = fastify.getSchema(schemaNamePost);
  const schemaPatch = fastify.getSchema(schemaNamePatch);

  if (schemaGet && schemaPost && schemaPatch) {
    // already exists, do nothing
  } else {
    const schema: any = sjs.getModelSchema(Model, {
      useRefs: false,
      exclude,
    });

    const _readOnly = ["id", "createdAt", "updatedAt", ...readOnly];
    const _writeOnly = [...writeOnly];

    const outProperties: Record<string, any> = {};
    const inProperties: Record<string, any> = {};

    Object.entries<{
      type: string | string[];
      additionalProperties?: boolean;
      nullable?: boolean;
      description?: string;
      format?: string;
      maxLength?: number;
    }>(schema.properties).forEach(([key, value]) => {
      if (!value.type) {
        value.type = "object";
        value.additionalProperties = true;
      }

      if (Array.isArray(value.type)) {
        value.nullable = value.type.includes("null");
        value.type = value.type.find((t) => t !== "null") || "object";
      }

      value.description = get(Model, ["fieldRawAttributesMap", key, "comment"]);

      if (!_readOnly.includes(key) && !_writeOnly.includes(key)) {
        outProperties[key] = value;
        inProperties[key] = value;
      } else if (_readOnly.includes(key)) {
        outProperties[key] = value;
      } else if (_writeOnly.includes(key)) {
        inProperties[key] = value;
      }
    });

    fastify.addSchema({
      ...schema,
      $id: schemaNameOut,
      properties: outProperties,
      required: (schema.required ?? []).filter((item: string) =>
        Object.keys(outProperties).includes(item),
      ),
    });

    fastify.addSchema({
      ...schema,
      $id: schemaNamePost,
      properties: inProperties,
      required: (schema.required ?? []).filter((item: string) =>
        Object.keys(inProperties).includes(item),
      ),
    });

    fastify.addSchema({
      ...schema,
      $id: schemaNamePatch,
      properties: inProperties,
      required: [],
    });
  }
};

const FastifySequelizeAPI = <I extends Model, L extends Model = I>({
  prefix = "",
  params = {},
  fastify,
  Model,
  genericView,
  preHandler = [],
  hasPermission = async () => true,
  hasObjectPermission = async () => true,
  lookupField = "id",
  lookupUrlParam = "id",

  getObject = async (request: FastifyRequest) => {
    const lookupValue = (request.params as Record<string, string>)[
      lookupUrlParam
    ];

    return await Model.findOne({
      where: {
        [lookupField]: lookupValue,
      },
    });
  }, //as (request: FastifyRequest) => Promise<I | null>,

  getObjects = (async () => await Model.findAll()) as (
    request: FastifyRequest,
  ) => Promise<L[]>,

  tags = [],
  descriptions = {},
  operationIds = {},
  performCreate = async (_req, instance) => instance.save(),
  performUpdate = async (_req, instance) => instance.save(),
  performDestroy = async (_req, instance) => instance.destroy(),
  responseSchema = null,
}: APIParams<I, L>): void => {
  const operationIdsResolved: Record<Operation, string> = {
    RETRIEVE: camelCase(`get ${Model.name}`),
    LIST: camelCase(`get ${Model.name}s`),
    CREATE: camelCase(`post ${Model.name}`),
    UPDATE_PATCH: camelCase(`patch ${Model.name}`),
    UPDATE_PUT: camelCase(`put ${Model.name}`),
    DESTROY: camelCase(`delete ${Model.name}`),
    ...operationIds,
  };

  const descriptionsResolved: Record<Operation, string> = {
    LIST: "Fetch instances.",
    RETRIEVE: "Retrieve an instance.",
    CREATE: "Create a new instance.",
    UPDATE_PATCH: "Update an instance.",
    UPDATE_PUT: "Update an instance.",
    DESTROY: "Destroy an instance.",
    ...descriptions,
  };

  const responseSchemaResolved = responseSchema ?? {
    $ref: FastifyGetSchemaName(Model, ""),
  };

  const postBodySchema = {
    $ref: FastifyGetSchemaName(Model, "post"),
  };

  const putBodySchema = { ...postBodySchema };

  const patchBodySchema = {
    $ref: FastifyGetSchemaName(Model, "patch"),
  };

  const _preHandler: preHandlerHookHandler[] = [
    ...preHandler,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (await hasPermission(request)) {
        const params = request.params as Record<string, string> | undefined;

        if (["POST"].includes(request.method)) {
          // pass
        } else if (params?.[lookupUrlParam]) {
          const instance = await getObject(request);

          if (instance) {
            if (await hasObjectPermission(request, instance)) {
              request.instance = instance;
            } else {
              return reply.code(403).send();
            }
          } else {
            return reply.code(404).send();
          }
        } else {
          // there is a use case that lands here
        }
      } else {
        return reply.code(401).send();
      }
    },
  ];

  const _preHandlerList: preHandlerHookHandler[] = [
    ..._preHandler,
    async (request: FastifyRequest) => {
      request.instances = await getObjects(request);
    },
  ];

  if (genericView.includes("RETRIEVE")) {
    fastify.get(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.RETRIEVE,
        description: descriptionsResolved.RETRIEVE,
        params,
        response: {
          200: responseSchemaResolved,
          403: {},
        },
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        return reply.code(200).send(request.instance);
      },
    });
  }

  if (genericView.includes("LIST")) {
    fastify.get(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.LIST,
        description: descriptionsResolved.LIST,
        params,
        response: {
          200: { type: "array", items: responseSchemaResolved },
          401: {},
          403: {},
          404: {},
        },
      },
      preHandler: _preHandlerList,
      async handler(request, reply) {
        return reply.code(200).send(request.instances);
      },
    });
  }

  if (genericView.includes("CREATE")) {
    fastify.post(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.CREATE,
        description: descriptionsResolved.CREATE,
        params,
        body: postBodySchema,
        response: {
          201: responseSchemaResolved,
          401: {},
          403: {},
          404: {},
        },
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        const instance = Model.build(request.body as any);
        await performCreate(request, instance);
        return reply.code(201).send(instance);
      },
    });
  }

  if (genericView.includes("UPDATE_PATCH")) {
    fastify.patch(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.UPDATE_PATCH,
        description: descriptionsResolved.UPDATE_PATCH,
        params,
        body: patchBodySchema,
        response: {
          200: responseSchemaResolved,
          401: {},
          403: {},
          404: {},
        },
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        const instance = request.instance as I;
        Object.assign(instance, request.body);
        await performUpdate(request, instance);
        return reply.code(200).send(instance);
      },
    });
  }

  if (genericView.includes("UPDATE_PUT")) {
    fastify.put(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.UPDATE_PUT,
        description: descriptionsResolved.UPDATE_PUT,
        params,
        body: putBodySchema,
        response: {
          200: responseSchemaResolved,
          401: {},
          403: {},
          404: {},
        },
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        const instance = request.instance as I;
        Object.assign(instance, request.body);
        await performUpdate(request, instance);
        return reply.code(200).send(instance);
      },
    });
  }

  if (genericView.includes("DESTROY")) {
    fastify.delete(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.DESTROY,
        description: descriptionsResolved.DESTROY,
        params,
        response: {
          200: {},
          400: {},
          401: {},
          403: {},
          404: {},
        },
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        const instance = request.instance as I;
        try {
          await performDestroy(request, instance);
          return reply.code(200).send();
        } catch (e) {
          return reply.code(400).send({ error: (e as Error).message });
        }
      },
    });
  }
};

export {
  FastifyAddModelSchema,
  FastifySequelizeGenericViews,
  FastifySequelizeAPI,
  FastifyGetSchemaName,
};
