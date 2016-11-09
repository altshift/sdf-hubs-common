"use strict";

// node dependencies
const url = require("url");

// npm dependencies
const {resolveRefsAt} = require("json-refs");
const {initializeMiddleware} = require("swagger-tools");
const resolveAllOf = require("json-schema-resolve-allof");
const {resolve} = require("../../lib/jsonSchemaHelpers");

// local dependencies
const apiHelpers = require("./apiHelpers");

/**
 * Function that return a proxy middleware waiting for the availability of the middleware given in parameters.
 * It is needed to use as a proxy in order to directly set a middleware without having to
 * wait for the real one to be ready.
 *
 * @param {object} _middleWareHolder holder of the middlewares
 * @param {string} _middlewareKey key in middleWareHolder for the midlleware to use
 * @returns {function} middleware function
 */
function applyMiddlewareGenerator(_middleWareHolder, _middlewareKey) {
    return function applyMiddleware(_request, _response, _next) {
        // If middleware is ready, use it, else call next middleware
        if (_middleWareHolder[_middlewareKey]) {
            _middleWareHolder[_middlewareKey](_request, _response, _next);
        } else {
            _next();
        }
    };
}

/**
 * @param {object} _swaggerMeta swagger request object
 * @param {string} _httpMethod http method of the request
 * @returns {void}
 */
function setSwaggerController(_swaggerMeta, _httpMethod) {
    const controllerNotDefined = _swaggerMeta && !_swaggerMeta.operation["x-swagger-router-controller"];
    const operationNotDefined = _swaggerMeta && !_swaggerMeta.operation.operationId;

    if (controllerNotDefined) {
        const urlParts = _swaggerMeta.apiPath.split("/");

        _swaggerMeta.operation["x-swagger-router-controller"] = urlParts[1];
        if (operationNotDefined) {
            const isGetById = _httpMethod === "GET" && urlParts[2] === "{id}";

            if (isGetById) {
                _swaggerMeta.operation.operationId = "getByIdRoute";
            } else if (urlParts.length > 2) {
                _swaggerMeta.operation.operationId = `${urlParts[2].toLowerCase()}Route`;
            } else {
                _swaggerMeta.operation.operationId = `${_httpMethod.toLowerCase()}Route`;
            }
        }
    }
}

/**
 * Set the db collection in asData guessed from the given url
 * @param {object} _asData altshift data we set to ease the request handling
 * @param {string} _url url to find
 * @returns {void}
 */
function setCollectionFromUrl(_asData, _url) {
    const collectionName = apiHelpers.guessCollectionFromUrl(_url);

    _asData.collectionName = collectionName;
    _asData.collection = global[collectionName];
}

/**
 * Enrich swagger request object with data usefull for controllers
 *
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function enrichSwaggerRequest(_request, _response, _next) {
    const isApiRequest = _request.swagger !== undefined;

    _request.asData = {};

    if (isApiRequest) {
        setSwaggerController(_request.swagger, _request.method);
        setCollectionFromUrl(_request.asData, _request.swagger.apiPath);

        _request.getFullUrl = () => {
            return url.format({
                host: _request.get("host"),
                pathname: _request.originalUrl,
                protocol: _request.protocol
            });
        };
    }
    _next();
}

/**
 * Load all external api middlewares
 *
 * @param {expressApp} _app express application
 * @param {string} _swaggerPath path of the swagger description
 * @param {string} _controllerPath path of the controllers folder
 * @returns {void}
 */
function load(_app, _swaggerPath, _controllerPath) {
    const middleWares = {};

    const swaggerObjectResolver = resolve(_swaggerPath, {refOptions: {filter: ["relative"]}});

    // Load Swagger data and prepare connect middleware
    swaggerObjectResolver.then((_swaggerObject) => {
        initializeMiddleware(_swaggerObject, (_swaggerMiddleware) => {
            middleWares.metadata = _swaggerMiddleware.swaggerMetadata();
            middleWares.validator = _swaggerMiddleware.swaggerValidator({validateResponse: true});
            middleWares.router = _swaggerMiddleware.swaggerRouter({
                controllers: _controllerPath,
                useStubs: false
            });
            middleWares.ui = _swaggerMiddleware.swaggerUi();
        });
    }).catch(console.error); // eslint-disable-line no-console

    // Use middleware when they are ready
    _app.use((_request, _response, _next) => {
        _response.originalEnd = _response.end;
        _next();
    });
    _app.use(applyMiddlewareGenerator(middleWares, "metadata"));
    _app.use(enrichSwaggerRequest);
    _app.use(applyMiddlewareGenerator(middleWares, "validator"));
    _app.use(applyMiddlewareGenerator(middleWares, "router"));
    _app.use(applyMiddlewareGenerator(middleWares, "ui"));
}

exports.load = load;

