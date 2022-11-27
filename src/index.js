const sjs = require('sequelize-json-schema')
const { camelCase } = require('change-case')

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
  excludeOnResponse = [],
  excludeOnCreateUpdate = [],
  performCreate = async (request, instance) => instance.save(),
  performUpdate = async (request, instance) => instance.save(),
  performDestroy = async (request, instance) => instance.destroy(),
  descriptions = {
    LIST: 'Fetch instances.',
    RETRIEVE: 'Retrieve an instance.',
    CREATE: 'Create a new instance.',
    UPDATE: 'Update an instance.',
    DESTROY: 'Destroy an instance.',
  },
}) => {
  // console.assert(prefix, 'prefix is required.')
  console.assert(fastify, 'fastify instance is required.')
  console.assert(Model, 'Model is required.')
  console.assert(genericView, 'genericView is required.')

  // const _params = {
  //   type: 'object',
  //   properties: Object.entries(params).reduce((a, [key, type]) => {
  //     a[key] = {
  //       type,
  //     }
  //     return a
  //   }, {}),
  //   required: Object.keys(params),
  // }

  // These fields are managed automatically and have no place in a create/update body.
  const _excludeOnCreateUpdate = [
    'id',
    'createdAt',
    'updatedAt',
    ...excludeOnCreateUpdate,
  ]

  const responseSchema = sjs.getModelSchema(Model, {
    useRefs: false,
    exclude: excludeOnResponse,
    // attributes: ['public'],
  })

  // console.log(responseSchema)
  const postBodySchema = sjs.getModelSchema(Model, {
    useRefs: false,
    exclude: _excludeOnCreateUpdate,
  })

  const putBodySchema = { ...postBodySchema }

  // shallow copy with `required` key removed
  const patchBodySchema = { ...putBodySchema }
  delete patchBodySchema['required']

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
        operationId: camelCase(`get ${Model.name}`),
        description: descriptions.RETRIEVE,
        params,
        response: {
          200: responseSchema,
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
        operationId: camelCase(`get ${Model.name}s`),
        description: descriptions.LIST,
        params,
        response: {
          200: { type: 'array', items: responseSchema },
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
        operationId: camelCase(`post ${Model.name}`),
        description: descriptions.CREATE,
        params,
        body: postBodySchema,
        response: {
          201: responseSchema,
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
        operationId: camelCase(`patch ${Model.name}`),
        description: descriptions.UPDATE,
        params,
        body: patchBodySchema,
        response: {
          200: responseSchema,
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
        operationId: camelCase(`put ${Model.name}`),
        description: descriptions.UPDATE,
        params,
        body: putBodySchema,
        response: {
          200: responseSchema,
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
        operationId: camelCase(`delete ${Model.name}`),
        description: descriptions.DESTROY,
        params,
        response: {
          200: {},
        },
      },
      preHandler: _preHandler,

      async handler(request, reply) {
        const instance = request.instance
        await performDestroy(request, instance)
        reply.code(200).send()
      },
    })
  }
}

module.exports = {
  FastifySequelizeGenericViews,
  FastifySequelizeAPI,
}
