import { FastifyInstance, preHandlerHookHandler, FastifyRequest } from 'fastify';
import { Model, ModelStatic, Attributes } from 'sequelize';
import { JSONSchema7 } from 'json-schema';

type Variation = "" | "post" | "patch";
type AddModelSchemaParams<M extends Model> = {
    fastify: FastifyInstance;
    Model: ModelStatic<M>;
    exclude?: (keyof Attributes<M>)[];
    readOnly?: (keyof Attributes<M>)[];
    writeOnly?: (keyof Attributes<M>)[];
};
type Operation = "RETRIEVE" | "LIST" | "CREATE" | "UPDATE_PATCH" | "UPDATE_PUT" | "DESTROY";
type APIParams<I extends Model, L extends Model = I> = {
    prefix?: string;
    params?: JSONSchema7;
    fastify: FastifyInstance;
    Model: ModelStatic<any>;
    genericView: Operation[];
    preHandler?: preHandlerHookHandler[];
    hasPermission?: (request: FastifyRequest) => Promise<boolean>;
    hasObjectPermission?: (request: FastifyRequest, instance: I) => Promise<boolean>;
    lookupField?: string;
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
declare const FastifySequelizeGenericViews: Record<string, Operation[]>;
declare const FastifyGetSchemaName: (Model: ModelStatic<Model>, variation?: Variation) => string;
declare const FastifyAddModelSchema: <M extends Model>({ fastify, Model, exclude, readOnly, writeOnly, }: AddModelSchemaParams<M>) => void;
declare const FastifySequelizeAPI: <I extends Model, L extends Model = I>({ prefix, params, fastify, Model, genericView, preHandler, hasPermission, hasObjectPermission, lookupField, lookupUrlParam, getObject, getObjects, tags, descriptions, operationIds, performCreate, performUpdate, performDestroy, responseSchema, }: APIParams<I, L>) => void;

export { FastifyAddModelSchema, FastifyGetSchemaName, FastifySequelizeAPI, FastifySequelizeGenericViews };
