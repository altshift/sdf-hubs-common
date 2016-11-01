"use strict";

// npm dependencies
const resolve = require("json-refs").resolveRefsAt;
const initializeSwagger = require("swagger-tools").initializeMiddleware;
const resolveAllOf = require("json-schema-resolve-allof");

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
 * @param {object} _swagger swagger request object
 * @param {string} _method http method of the request
 * @returns {void}
 */
function setSwaggerController(_swagger, _method) {
    const controllerNotDefined = _swagger && !_swagger.operation["x-swagger-router-controller"];

    if (controllerNotDefined) {
        const urlParts = _swagger.apiPath.split("/");

        _swagger.operation["x-swagger-router-controller"] = urlParts[1];
        if (_method === "GET" && urlParts[2] === "{id}") {
            _swagger.operation.operationId = "getByIdRoute";
        } else {
            _swagger.operation.operationId = `${_method.toLowerCase()}Route`;
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
    const isApiRequest = _request.swagger;

    _request.asData = {};

    if (isApiRequest) {
        setSwaggerController(_request.swagger, _request.method);
        setCollectionFromUrl(_request.asData, _request.swagger.apiPath);
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

    const swaggerObjectResolver = resolve(_swaggerPath, {filter: ["relative"]});

    // Load Swagger data and prepare connect middleware
    swaggerObjectResolver.then(swaggerObject => {
        const finalDesc = resolveAllOf(swaggerObject.resolved);

        initializeSwagger(finalDesc, _swaggerMiddleware => {
            middleWares.metadata = _swaggerMiddleware.swaggerMetadata();
            middleWares.validator = _swaggerMiddleware.swaggerValidator({validateResponse: true});
            middleWares.router = _swaggerMiddleware.swaggerRouter({
                controllers: _controllerPath,
                useStubs: false
            });
            middleWares.ui = _swaggerMiddleware.swaggerUi();
        });
    }).catch(console.error);

    // Use middleware when they are ready
    _app.use(applyMiddlewareGenerator(middleWares, "metadata"));
    _app.use(enrichSwaggerRequest);
    _app.use(applyMiddlewareGenerator(middleWares, "validator"));
    _app.use(applyMiddlewareGenerator(middleWares, "router"));
    _app.use(applyMiddlewareGenerator(middleWares, "ui"));
}

exports.load = load;

