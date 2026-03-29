// src/index.ts
import sjs from "sequelize-json-schema";
import { camelCase, pascalCase } from "change-case";
import get from "lodash.get";
var FastifySequelizeGenericViews = {
  ListAPIView: ["LIST"],
  ListCreateAPIView: ["LIST", "CREATE"],
  RetrieveAPIView: ["RETRIEVE"],
  CreateAPIView: ["CREATE"],
  UpdateAPIView: ["UPDATE_PATCH", "UPDATE_PUT"],
  RetrieveUpdateDestroyAPIView: [
    "RETRIEVE",
    "UPDATE_PATCH",
    "UPDATE_PUT",
    "DESTROY"
  ]
};
var FastifyGetSchemaName = (Model, variation = "") => pascalCase(`${Model.name} ${variation}`);
var FastifyAddModelSchema = ({
  fastify,
  Model,
  exclude = [],
  readOnly = [],
  writeOnly = []
}) => {
  const schemaNameOut = FastifyGetSchemaName(Model, "");
  const schemaNamePost = FastifyGetSchemaName(Model, "post");
  const schemaNamePatch = FastifyGetSchemaName(Model, "patch");
  const schemaGet = fastify.getSchema(schemaNameOut);
  const schemaPost = fastify.getSchema(schemaNamePost);
  const schemaPatch = fastify.getSchema(schemaNamePatch);
  if (schemaGet && schemaPost && schemaPatch) {
  } else {
    const schema = sjs.getModelSchema(Model, {
      useRefs: false,
      exclude
    });
    const _readOnly = ["id", "createdAt", "updatedAt", ...readOnly];
    const _writeOnly = [...writeOnly];
    const outProperties = {};
    const inProperties = {};
    Object.entries(schema.properties).forEach(([key, value]) => {
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
      required: (schema.required ?? []).filter(
        (item) => Object.keys(outProperties).includes(item)
      )
    });
    fastify.addSchema({
      ...schema,
      $id: schemaNamePost,
      properties: inProperties,
      required: (schema.required ?? []).filter(
        (item) => Object.keys(inProperties).includes(item)
      )
    });
    fastify.addSchema({
      ...schema,
      $id: schemaNamePatch,
      properties: inProperties,
      required: []
    });
  }
};
var FastifySequelizeAPI = ({
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
  getObject = async (request) => {
    const lookupValue = request.params[lookupUrlParam];
    return await Model.findOne({
      where: {
        [lookupField]: lookupValue
      }
    });
  },
  //as (request: FastifyRequest) => Promise<I | null>,
  getObjects = (async () => await Model.findAll()),
  tags = [],
  descriptions = {},
  operationIds = {},
  performCreate = async (_req, instance) => instance.save(),
  performUpdate = async (_req, instance) => instance.save(),
  performDestroy = async (_req, instance) => instance.destroy(),
  responseSchema = null
}) => {
  const operationIdsResolved = {
    RETRIEVE: camelCase(`get ${Model.name}`),
    LIST: camelCase(`get ${Model.name}s`),
    CREATE: camelCase(`post ${Model.name}`),
    UPDATE_PATCH: camelCase(`patch ${Model.name}`),
    UPDATE_PUT: camelCase(`put ${Model.name}`),
    DESTROY: camelCase(`delete ${Model.name}`),
    ...operationIds
  };
  const descriptionsResolved = {
    LIST: "Fetch instances.",
    RETRIEVE: "Retrieve an instance.",
    CREATE: "Create a new instance.",
    UPDATE_PATCH: "Update an instance.",
    UPDATE_PUT: "Update an instance.",
    DESTROY: "Destroy an instance.",
    ...descriptions
  };
  const responseSchemaResolved = responseSchema ?? {
    $ref: FastifyGetSchemaName(Model, "")
  };
  const postBodySchema = {
    $ref: FastifyGetSchemaName(Model, "post")
  };
  const putBodySchema = { ...postBodySchema };
  const patchBodySchema = {
    $ref: FastifyGetSchemaName(Model, "patch")
  };
  const _preHandler = [
    ...preHandler,
    async (request, reply) => {
      if (await hasPermission(request)) {
        const params2 = request.params;
        if (["POST"].includes(request.method)) {
        } else if (params2?.[lookupUrlParam]) {
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
        }
      } else {
        return reply.code(401).send();
      }
    }
  ];
  const _preHandlerList = [
    ..._preHandler,
    async (request) => {
      request.instances = await getObjects(request);
    }
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
          403: {}
        }
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        return reply.code(200).send(request.instance);
      }
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
          404: {}
        }
      },
      preHandler: _preHandlerList,
      async handler(request, reply) {
        return reply.code(200).send(request.instances);
      }
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
          404: {}
        }
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        const instance = Model.build(request.body);
        await performCreate(request, instance);
        return reply.code(201).send(instance);
      }
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
          404: {}
        }
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        const instance = request.instance;
        Object.assign(instance, request.body);
        await performUpdate(request, instance);
        return reply.code(200).send(instance);
      }
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
          404: {}
        }
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        const instance = request.instance;
        Object.assign(instance, request.body);
        await performUpdate(request, instance);
        return reply.code(200).send(instance);
      }
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
          404: {}
        }
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        const instance = request.instance;
        try {
          await performDestroy(request, instance);
          return reply.code(200).send();
        } catch (e) {
          return reply.code(400).send({ error: e.message });
        }
      }
    });
  }
};
export {
  FastifyAddModelSchema,
  FastifyGetSchemaName,
  FastifySequelizeAPI,
  FastifySequelizeGenericViews
};
//# sourceMappingURL=index.js.map