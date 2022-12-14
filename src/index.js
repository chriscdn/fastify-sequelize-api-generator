const sjs = require('sequelize-json-schema')
const { camelCase, pascalCase } = require('change-case')
const get = require('lodash.get')
/**
 *
 * @param {*} Model
 * @param {(''|'post'|'patch')} variation
 */
function FastifyGetSchemaName(Model, variation = '') {
  return pascalCase(`${Model.name} ${variation}`)
}

/**
 * This adds three schemas to the fastify instance:
 *
 * - <ModelName>Post - For POSTing and PUTing.
 * - <ModelName>Patch - Same as the POST variant, with "required" fields removed.
 * - <ModelName>Out - For GET.
 *
 * See here: https://swagger.io/docs/specification/data-models/data-types/
 *
 * @param {object} param0
 * @param {object} param0.fastify
 * @param {object} param0.Model
 * @param {object} param0.exclude
 * @param {object} param0.readOnly
 * @param {object} param0.writeOnly
 */
function FastifyAddModelSchema({
  fastify,
  Model,
  exclude = [],
  readOnly = [],
  writeOnly = [],
}) {
  const schemaNameOut = FastifyGetSchemaName(Model, '')
  const schemaNamePost = FastifyGetSchemaName(Model, 'post')
  const schemaNamePatch = FastifyGetSchemaName(Model, 'patch')

  const schemaGet = fastify.getSchema(schemaNameOut)
  const schemaPost = fastify.getSchema(schemaNamePost)
  const schemaPatch = fastify.getSchema(schemaNamePatch)

  if (schemaGet && schemaPost && schemaPatch) {
    // already exists, do nothing
  } else {
    const schema = sjs.getModelSchema(Model, {
      useRefs: false,
      exclude,
    })

    const _readOnly = ['id', 'createdAt', 'updatedAt', ...readOnly]
    const _writeOnly = [...writeOnly]

    const outProperties = {}
    const inProperties = {}

    Object.entries(schema.properties).forEach(([key, value]) => {
      value.description = get(Model, ['fieldRawAttributesMap', key, 'comment'])

      if (!_readOnly.includes(key) && !writeOnly.includes(key)) {
        outProperties[key] = value
        inProperties[key] = value
      } else if (_readOnly.includes(key)) {
        outProperties[key] = value
      } else if (_writeOnly.includes(key)) {
        inProperties[key] = value
      }
    })

    fastify.addSchema({
      ...schema,
      $id: schemaNameOut,
      properties: outProperties,
      required: (schema.required ?? []).filter((item) =>
        Object.keys(outProperties).includes(item)
      ),
    })

    fastify.addSchema({
      ...schema,
      $id: schemaNamePost,
      properties: inProperties,
      required: (schema.required ?? []).filter((item) =>
        Object.keys(inProperties).includes(item)
      ),
    })

    fastify.addSchema({
      ...schema,
      $id: schemaNamePatch,
      properties: inProperties,
      required: [],
    })
  }
}

const FastifySequelizeGenericViews = Object.freeze({
  ListAPIView: ['LIST'],
  ListCreateAPIView: ['LIST', 'CREATE'],
  RetrieveAPIView: ['RETRIEVE'],
  CreateAPIView: ['CREATE'],
  UpdateAPIView: ['UPDATE'],
  RetrieveUpdateDestroyAPIView: ['RETRIEVE', 'UPDATE', 'DESTROY'],
})
/**
 *
 * @param {prefix} param0
 */
const FastifySequelizeAPI = ({
  prefix = '',
  params = {}, // e.g., {id:'integer'}
  fastify,
  Model,
  genericView,
  preHandler = [],
  hasPermission = async (_request) => true,
  hasObjectPermission = async (_request, _instance) => true,
  lookupField = 'id',
  lookupUrlParam = 'id',
  getObject = async (request) =>
    Model.findOne({
      where: {
        [lookupField]: request.params[lookupUrlParam],
      },
    }), // assumes id
  getObjects = async (_request) => Model.findAll(),
  tags = [],
  descriptions = {},
  operationIds = {},
  performCreate = async (request, instance) => await instance.save(),
  performUpdate = async (request, instance) => await instance.save(),
  performDestroy = async (request, instance) => await instance.destroy(),

  // This is automatically wrapped in an `type: 'array'` if the response is a list.
  responseSchema = null,
}) => {
  // console.assert(prefix, 'prefix is required.')
  console.assert(fastify, 'fastify instance is required.')
  console.assert(Model, 'Model is required.')
  console.assert(genericView, 'genericView is required.')

  const operationIdsResolved = {
    RETRIEVE: camelCase(`get ${Model.name}`),
    LIST: camelCase(`get ${Model.name}s`),
    CREATE: camelCase(`post ${Model.name}`),
    UPDATE_PATCH: camelCase(`patch ${Model.name}`),
    UPDATE_PUT: camelCase(`put ${Model.name}`),
    DESTROY: camelCase(`delete ${Model.name}`),
    ...operationIds,
  }

  const descriptionsResolved = {
    LIST: 'Fetch instances.',
    RETRIEVE: 'Retrieve an instance.',
    CREATE: 'Create a new instance.',
    UPDATE: 'Update an instance.',
    DESTROY: 'Destroy an instance.',
    ...descriptions,
  }

  // These fields are managed automatically and have no place in a create/update body.
  // const _excludeOnCreateUpdate = [
  //   'id',
  //   'createdAt',
  //   'updatedAt',
  //   ...excludeOnCreateUpdate,
  // ]

  // const responseSchemaResolved = sjs.getModelSchema(Model, {
  //   useRefs: false,
  //   exclude: excludeOnResponse,
  //   // attributes: ['public'],
  // })

  const responseSchemaResolved = responseSchema ?? {
    $ref: FastifyGetSchemaName(Model, ''),
  }

  // const postBodySchema = sjs.getModelSchema(Model, {
  //   useRefs: false,
  //   exclude: _excludeOnCreateUpdate,
  // })

  const postBodySchema = {
    $ref: FastifyGetSchemaName(Model, 'post'),
  }

  const putBodySchema = { ...postBodySchema }

  // shallow copy with `required` key removed
  const patchBodySchema = {
    $ref: FastifyGetSchemaName(Model, 'patch'),
  }

  // in the patch variant already
  // delete patchBodySchema['required']

  const _preHandler = [
    ...preHandler,
    async (request, reply) => {
      if (await hasPermission(request)) {
        if (['POST'].includes(request.method)) {
          // pass
        } else if (request.params[lookupUrlParam]) {
          const instance = await getObject(request)

          if (instance) {
            if (await hasObjectPermission(request, instance)) {
              request.instance = instance
            } else {
              reply.code(403).send()
            }
          } else {
            reply.code(404).send()
          }
        }
      } else {
        reply.code(401).send()
      }
    },
  ]

  const _preHandlerList = [
    ..._preHandler,
    async (request, _reply) => {
      request.instances = await getObjects(request)
    },
  ]

  if (genericView.includes('RETRIEVE')) {
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
        const instance = request.instance
        reply.code(200).send(instance)
      },
    })
  }

  if (genericView.includes('LIST')) {
    fastify.get(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.LIST,
        description: descriptionsResolved.LIST,
        params,
        response: {
          200: { type: 'array', items: responseSchemaResolved },
          403: {},
        },
      },
      preHandler: _preHandlerList,
      async handler(request, reply) {
        reply.code(200).send(request.instances)
      },
    })
  }

  if (genericView.includes('CREATE')) {
    fastify.post(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.CREATE,
        description: descriptionsResolved.CREATE,
        params,
        body: postBodySchema,
        response: {
          201: responseSchemaResolved,
        },
      },
      preHandler: _preHandler,
      async handler(request, reply) {
        // build does not save
        const instance = await Model.build(request.body)

        await performCreate(request, instance)

        reply.code(201).send(instance)
      },
    })
  }

  if (genericView.includes('UPDATE')) {
    fastify.patch(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.UPDATE_PATCH,
        description: descriptionsResolved.UPDATE,
        params,
        body: patchBodySchema,
        response: {
          200: responseSchemaResolved,
        },
      },
      preHandler: _preHandler,

      async handler(request, reply) {
        const instance = request.instance

        Object.assign(instance, request.body)

        await performUpdate(request, instance)

        reply.code(200).send(instance)
      },
    })

    fastify.put(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.UPDATE_PUT,
        description: descriptionsResolved.UPDATE,
        params,
        body: putBodySchema,
        response: {
          200: responseSchemaResolved,
        },
      },
      preHandler: _preHandler,

      async handler(request, reply) {
        const instance = request.instance

        Object.assign(instance, request.body)

        await performUpdate(request, instance)

        reply.code(200).send(instance)
      },
    })
  }

  if (genericView.includes('DESTROY')) {
    fastify.delete(prefix, {
      schema: {
        tags,
        operationId: operationIdsResolved.DESTROY,
        description: descriptionsResolved.DESTROY,
        params,
        response: {
          200: {},
        },
      },
      preHandler: _preHandler,

      async handler(request, reply) {
        const instance = request.instance
        try {
          await performDestroy(request, instance)
          reply.code(200).send()
        } catch (e) {
          reply.code(400).send(e)
        }
      },
    })
  }
}

module.exports = {
  FastifyAddModelSchema,
  FastifySequelizeGenericViews,
  FastifySequelizeAPI,
  FastifyGetSchemaName,
}
