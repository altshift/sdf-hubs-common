"use strict";

const i18n = require("../../api/common/i18n");

/**
 * @param {object} _Handlebars handlebar object used to compile the template using the helpers
 * @return{void}
*/
function registerHelpers(_Handlebars) {
    _Handlebars.registerHelper("t", (_key) => {
        return i18n.translate(_key);
    });

    _Handlebars.registerHelper("concat", (...args) => {
        args.length -= 1;

        return args.join("");
    });
}

module.exports = {registerHelpers};
