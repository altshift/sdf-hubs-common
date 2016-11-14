"use strict";
const {deepifyObject} = require("./resquetHelpers");
const {sqlParseTail} = require("./sqlParser");

/**
 *
 * @param {string} _baseTable the base table used to do the joint
 * @param {string[]} _requestArray an array of all the request object ( {request : "value" , "alias" : value})
 * to be included and put in the "from" clause
 * @param {string} _operator the operator (OR or AND) to place between the request
 * @param {string} [_filter] used to filter all the data
 * @returns {string} A string that can be added at the end of a "string" request
 *
 */
function selectWithNestedFrom(_baseTable, _requestArray, _operator, _filter) {
    let ret = `SELECT "${_baseTable}".* \n FROM "${_baseTable}"\n`;

    _requestArray.forEach((_requestItem) => {
        const JOIN = `LEFT JOIN (${_requestItem.request}) as "${_requestItem.alias}" `;
        const ON = `ON "${_baseTable}".id = "${_requestItem.alias}".id\n`;

        ret += `${JOIN}${ON}`;
    });

    if (_filter === undefined) {
        ret += `\nWHERE (("${_baseTable}".id = "${_requestArray[0].alias}".id) \n`;
    } else {
        ret += `\nWHERE ${_filter} AND  ("${_baseTable}".id = "${_requestArray[0].alias}".id) \n`;
    }

    _requestArray.forEach((_requestItem) => {
        ret += ` ${_operator} ("${_baseTable}".id = "${_requestItem.alias}".id)\n`;
    });

    ret += ")";

    return ret;
}

/**
 * Return a string with the sort, skip and order by selectors
 * that can be easily added to an sql request (at the end)
 * @param {object} _req the request object provided by sails
 * @param {object} _options sqlParseTail options
 * @returns {string} a string that can be added at the end of a "string" request
 *
 */
function genericSkipLimitOrderSqlAdapter(_req, _options = {}) {
    const query = deepifyObject(_req.query);
    const parsedTail = sqlParseTail(query, null, _options);

    return parsedTail.sqlTail;
}

module.exports = {
    genericSkipLimitOrderSqlAdapter,
    selectWithNestedFrom
};
