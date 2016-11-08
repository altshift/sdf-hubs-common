"use strict";

const fs = require("fs");
const path = require("path");
const pgClient = require("./pgClient");

const sqlFileCache = {};
let connectionConfig, sqlPath;



function sqlParseWhere($query, $baseTable, $options) {
    $options = $options || {};
    var i, queryItem, queryContent,
        needsOperator2 = false,
        needsOperator = false,
        propName = null,
        propName2 = null,
        value,
        sql;

    sql = "(";
    queryContent = $query.where;

    if (queryContent) {
        for (propName in queryContent) {
            // QueryContent may not have correct prototype, so i use the function from the prototype
            if (Object.hasOwnProperty.call(queryContent, propName)) {
                queryItem = queryContent[propName];
                if (needsOperator) {
                    sql += " AND ";
                }
                needsOperator = true;
                needsOperator2 = false;

                if (typeof queryItem === "string") {
                    // Simple value
                    sql += " \"" + $baseTable + "\".\"" + propName + "\"=" + "'" + queryItem.replace("'", "''") + "' ";
                } else {
                    // Modifiers
                    switch (propName.toLowerCase()) {
                    case "or":
                        sql += " (";
                        for (i = 0; i < queryItem.length; i += 1) {
                            sql += sqlParseWhere({
                                where: queryItem[i]
                            }, $baseTable);
                            if (i < queryItem.length - 1) {
                                sql += " OR ";
                            }
                        }
                        sql += ") ";
                        break;
                    default:
                        // Query Modifier
                        for (propName2 in queryItem) {
                            if (queryItem.hasOwnProperty(propName2)) {
                                if (needsOperator2) {
                                    sql += " AND ";
                                }
                                needsOperator2 = true;
                                value = queryItem[propName2];
                                if (typeof value === "string") {
                                    // Simple value
                                    value = value.replace("'", "''");
                                }
                                switch (propName2) {
                                case "lessThan":
                                    sql += " \"" + $baseTable + "\".\"" + propName + "\"<" + "'" + value + "' ";
                                    break;
                                case "greaterThan":
                                    sql += " \"" + $baseTable + "\".\"" + propName + "\">" + "'" + value + "' ";
                                    break;
                                case "contains":
                                    sql += " \"" + $baseTable + "\".\"" + propName + "\" ILIKE " + "'%" + value + "%' ";
                                    break;

                                case "startsWith":
                                    sql += " \"" + $baseTable + "\".\"" + propName + "\" ILIKE " + "'" + value + "%' ";
                                    break;

                                case "endsWith":
                                    sql += " \"" + $baseTable + "\".\"" + propName + "\" ILIKE " + "'%" + value + "' ";
                                    break;
                                case "not":
                                    sql += " \"" + $baseTable + "\".\"" + propName + "\" <> " + "'" + value + "' ";
                                    break;
                                default:
                                    console.error("UNHANDLED OPERATOR FOR SQL WHERE:", propName2);
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
    }
    sql += ")";

    if (sql === "()") {
        sql = "";
    }

    return sql;
}

/**
 * @param {string} $sqlQuery the string of the request, may use prepared statement by including "$1 $2" string
 * @param {object} $preparedValues table of the values supposed to replace the "$" values in the statement
 * @returns {promise} Promise returning the query object
 */
function pSqlRequestQuery($sqlQuery, $preparedValues) {
    let promise;

    if ($sqlQuery) {
        promise = pgClient(connectionConfig).then(($$client) => {
            const query = $$client.query($sqlQuery, $preparedValues);

            // Return an object because query is also a promise and will be resolved
            // but here we want the query object itself
            return Promise.resolve({client: $$client, query});
        });
    } else {
        promise = Promise.reject(new Error("non existing query"));
    }

    return promise;
}

/**
 * @param {string} $sqlQuery the string of the request, may use prepared statement by including "$1 $2" string
 * @param {object} $preparedValues table of the values supposed to replace the "$" values in the statement
 * @returns {promise} Promise returning the rows
 */
function pSqlRequest($sqlQuery, $preparedValues) {
    return pSqlRequestQuery($sqlQuery, $preparedValues).then(({query}) => {
        return query.then(({rows}) => rows);
    });
}

/**
 *
 * @param $baseTable the base table used to do the joint
 * @param $requestArray an array of all the request object ( {request : "value" , "alias" : value}) to be included and put in the "from" clause
 * @param $operator the operator (OR or AND) to place between the request
 * @param $filter optional, used to filter all the data
 * @returns a string that can be added at the end of a "string" request
 *
 */
function selectWithNestedFrom($baseTable, $requestArray, $operator, $filter) {
    var i,
        ret = 'SELECT "' + $baseTable + '".* ' + "\n" +
            'FROM "' + $baseTable + '"' + "\n";

    for (i = 0; i < $requestArray.length; i++) {
        ret += 'LEFT JOIN (' + $requestArray[i].request + ') as "' + $requestArray[i].alias + '" ON "' + $baseTable + '"."id"="' + $requestArray[i].alias + '"."id"' + '\n';
    }

    if ($filter) {
        ret += "\n" + 'WHERE ' + $filter + ' AND ' + ' ("' + $baseTable + '"."id" = "' + $requestArray[0].alias + '"."id") ' + "\n";
    } else {
        ret += "\n" + 'WHERE (("' + $baseTable + '"."id" = "' + $requestArray[0].alias + '"."id") ' + "\n";
    }

    for (i = 1; i < $requestArray.length; i++) {
        ret += ' ' + $operator + ' ("' + $baseTable + '"."id" = "' + $requestArray[i].alias + '"."id")' + "\n";
    }

    ret += ")";

    return ret;
}


/**
 * Set path of sql files
 * @param {string} _path The path where the sql files are
 * @returns {void}
 */
function sqlSetPath(_path) {
    sqlPath = _path;
}

/**
 * Set path of sql files
 * @param {string} _path The path where the sql files are
 * @returns {void}
 */
function sqlSetConnectionConfig(_connectionConfig) {
    connectionConfig = _connectionConfig;
}

/**
 * Load a sql from a file and execute the query, return the sql as a string
 * @param {string} _filename Name of the file to load
 * @param {object} _values value to replace in the sql file template is "{{attname}}"
 * @returns {string} the sql request
 */
function sqlLoad(_filename, _values = {}) {
    let sql, attName, regExp;

    sql = sqlFileCache[_filename];
    if (!sql) {
        const filePath = path.join(sqlPath, `${_filename}.sql`);

        sql = fs.readFileSync(filePath, {encoding: "utf8"});
    }

    for (attName in _values) {
        regExp = new RegExp(`{{${attName}}}`, "g");
        sql = sql.replace(regExp, _values[attName]);
    }

    sql = sql.replace(/{{[^}]*}}/g, "");

    return sql;
}

module.exports = {
    pSqlRequest,
    pSqlRequestQuery,
    selectWithNestedFrom,
    sqlLoad,
    sqlParseWhere,
    sqlSetConnectionConfig,
    sqlSetPath
};

