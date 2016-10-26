"use strict";
const resolve = require("json-refs").resolveRefsAt;
const initializeSwagger = require("swagger-tools").initializeMiddleware;
const resolveAllOf = require("json-schema-resolve-allof");

/**
 * Function that return a proxy middleware waiting for the availability of the middleware given in parameters.
 * It is needed to use as a proxy in order to directly set a middleware without having to
 * wait for the real one to be ready.
 *
 * @param {object} middleWareHolder holder of the middlewares
 * @param {string} middlewareKey key in middleWareHolder for the midlleware to use
 * @returns {function} middleware function
 */
function applyMiddlewareGenerator(middleWareHolder, middlewareKey) {
    return function applyMiddleware(_request, _response, _next) {
        // If middleware is ready, use it, else call next middleware
        if (middleWareHolder[middlewareKey]) {
            middleWareHolder[middlewareKey](_request, _response, _next);
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
    if (_request.swagger && !_request.swagger.operation["x-swagger-router-controller"]) {
        const urlParts = _request.url.substring("/api/v1/".length).split("/");

        _request.swagger.operation["x-swagger-router-controller"] = urlParts[0];
    }
    _next();
}

/**
 * Load all external api middlewares
 *
 * @param {expressApp} app express application
 * @returns {void}
 */
function load(app, swaggerPath, controllerPath) {
    const middleWares = {};

    const swaggerObjectResolver = resolve(swaggerPath, {filter: ["relative"]});

    // Load Swagger data and prepare connect middleware
    swaggerObjectResolver.then(swaggerObject => {
        const finalDesc = resolveAllOf(swaggerObject.resolved);

        initializeSwagger(finalDesc, _swaggerMiddleware => {
            middleWares.metadata = _swaggerMiddleware.swaggerMetadata();
            middleWares.validator = _swaggerMiddleware.swaggerValidator({validateResponse: true});
            middleWares.router = _swaggerMiddleware.swaggerRouter({
                controllers: controllerPath,
                useStubs: false
            });
            middleWares.ui = _swaggerMiddleware.swaggerUi();
        });
    }).catch(console.error);

    // Use middleware when they are ready
    app.use(applyMiddlewareGenerator(middleWares, "metadata"));
    app.use(addDefaultController);
    app.use(applyMiddlewareGenerator(middleWares, "validator"));
    app.use(applyMiddlewareGenerator(middleWares, "router"));
    app.use(applyMiddlewareGenerator(middleWares, "ui"));
}

exports.load = load;
