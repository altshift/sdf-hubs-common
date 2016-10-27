"use strict";

const resolve = require("json-refs").resolveRefsAt;
const initializeSwagger = require("swagger-tools").initializeMiddleware;
const resolveAllOf = require("json-schema-resolve-allof");

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
 * Add default controller name for operations (because swagger is too dumb to do it)
 *
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function addDefaultController(_request, _response, _next) {
    const controllerNotDefined = _request.swaggerZZZ
                                && !_request.swagger.operation["x-swagger-router-controller"];

    if (controllerNotDefined) {
        const urlParts = _request.url.substring("/api/v1/".length).split("/");

        _request.swagger.operation["x-swagger-router-controller"] = urlParts[0];
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
    _app.use(addDefaultController);
    _app.use(applyMiddlewareGenerator(middleWares, "validator"));
    _app.use(applyMiddlewareGenerator(middleWares, "router"));
    _app.use(applyMiddlewareGenerator(middleWares, "ui"));
}

exports.load = load;

