"use strict";
const {deepifyObject} = require("./requestHelpers");

/**
 * Return an array without duplicated values
 *
 * @param {any[]} _arrayToFilter base array where to remove dups
 * @returns {any[]} array without dup
 */
function arrayUnique(_arrayToFilter) {
    return _arrayToFilter
        .filter((_value, _index) => {
            return _arrayToFilter.every((_value2, _index2) => {
                const isDuplicate = _value2 === _value && _index2 > _index;

                return !isDuplicate;
            });
        });
}


/**
 * Return {sqlTail: "SQL query as String containing skip order by limit",
 * from: ["list", "of", "tableName", "needed", "in", "query"]}
 *
 * @param {object} _query The query to transform into a tail sql
 * @param {string} _baseTableName The table to get association from
 * @param {object} doNotSort If true, do not append sort string
 * @returns {object} An object with the string query and other informations
 */
function sqlParseTail({limit, skip, sort}, _baseTableName, {doNotSort} = {}) {
    let sortDotSplit,
        sqlTail = "",
        sortOrder = "DESC",
        sortValue = sort;

    const sortTab = sort && sort.split(" ");
    const table = _baseTableName && global[_baseTableName];
    const tableName = table && table.tableName || _baseTableName;
    const associations = table && table.getAssociations && table.getAssociations();
    const from = tableName ? [tableName] : [];
    const associationUsed = [];

    if (!doNotSort) {
        // Get sort and sort order
        if (!sortValue) {
            sortValue = "createdAt";
        } else if (sortTab && sortTab.length === 2) {
            sortValue = sortTab[0];
            sortOrder = sortOrder && sortTab[1];
        } else if (sortTab && sortTab.length === 1) {
            sortValue = sortTab[0];
        }

        // If sorted and there is associations for this table
        if (sortValue && associations) {
            sortDotSplit = sortValue.split(".");
            // If sorted is like "A.B"
            if (sortDotSplit.length === 2) { // TODO more than one depth
                // If sort value match an association
                if (associations[sortDotSplit[0]]) {
                    sortValue = `${associations[sortDotSplit[0]].model}\".\"${sortDotSplit[1]}`;
                    from.push(associations[sortDotSplit[0]].model);
                    associationUsed.push(associations[sortDotSplit[0]]);
                }
            }
        }

        // Build order by command
        if (sortValue.indexOf("random") === -1) {
            sqlTail += `ORDER BY \"${sortValue}\" ${sortOrder}`;
        } else {
            sqlTail += "ORDER BY random() ";
        }
    }

    // Limit
    if (limit) {
        sqlTail += ` LIMIT '${limit}'`;
    }

    // Skip
    if (skip) {
        sqlTail += ` OFFSET '${skip}'`;
    }

    return {associationUsed, from, sqlTail};
}

/**
* return {where: "sql where clause", from: [list, of, table, needed]}
*/
function sqlParseWhere({where}, $baseTable) {
    let queryItem, value, sqlWhere, parsedInnerQuery,
        needsOperator2 = false,
        needsOperator = false,
        associationUsed = [];
    const table = global[$baseTable];
    const tableName = table && table.tableName || $baseTable;
    const associations = table && table.getAssociations && table.getAssociations();
    const from = [tableName];
    const queryContent = where;

    sqlWhere = "(";

    if (queryContent) {
        Object.keys(queryContent).forEach((propName) => {
            queryItem = queryContent[propName];
            if (needsOperator) {
                sqlWhere += " AND ";
            }
            needsOperator = true;
            needsOperator2 = false;

            if (typeof queryItem !== "object") {
                if (typeof queryItem === "string") {
                    queryItem = queryItem.replace("'", "''");
                }
                // Simple value
                sqlWhere += ` \"${tableName}\".\"${propName}\"='${queryItem}' `;
            } else {
                // Modifiers (or)

                switch (propName.toLowerCase()) {
                case "or":
                    sqlWhere += " (";
                    queryItem.forEach((_orItem, _index) => {
                        parsedInnerQuery = sqlParseWhere({where: _orItem}, $baseTable);
                        const assoc = associationUsed.concat(parsedInnerQuery.associationUsed);

                        associationUsed = arrayUnique(assoc);

                        sqlWhere += parsedInnerQuery.sqlWhere;
                        if (_index < queryItem.length - 1) {
                            sqlWhere += " OR ";
                        }
                    });
                    sqlWhere += ") ";
                    break;
                default:
                    // Query Modifier
                    Object.keys(queryItem).forEach((propName2) => {
                        if (needsOperator2) {
                            sqlWhere += " AND ";
                        }
                        needsOperator2 = true;
                        value = queryItem[propName2];
                        if (typeof value === "string") {
                            // Simple value
                            value = value.replace("'", "''");
                        }
                        switch (propName2) {
                        case "lessThan":
                            sqlWhere += ` \"${tableName}\".\"${propName}\"<'${value}' `;
                            break;
                        case "greaterThan":
                            sqlWhere += ` \"${tableName}\".\"${propName}\">'${value}' `;
                            break;
                        case "contains":
                            sqlWhere += ` unaccent(\"${tableName}\".\"${propName}\") ILIKE unaccent('%${value}%') `;
                            break;
                        case "startsWith":
                            sqlWhere += ` unaccent(\"${tableName}\".\"${propName}\") ILIKE unaccent('${value}%') `;
                            break;
                        case "endsWith":
                            sqlWhere += ` unaccent(\"${tableName}\".\"${propName}\") ILIKE unaccent('%${value}') `;
                            break;
                        case "not":
                            sqlWhere += ` \"${tableName}\".\"${propName}\" <> '${value}' `;
                            break;
                        default:

                            if (associations && associations[propName]) {
                                associationUsed.push(associations[propName]);
                                sqlWhere += `\"${associations[propName].model}\".\"${propName2}\" = '${value}'`;
                            } else if (global[propName]) {
                                from.push(propName);
                                sqlWhere += `\"${propName}\".\"${propName2}\" = '${value}'`;
                            }
                        }
                    });
                    break;
                }
            }
        });
    }
    associationUsed.forEach((_association) => {
        sqlWhere += ` AND \"${tableName}\".\"${_association.key}\" = \"${_association.model}\".id`;
        from.push(_association.model);
    });
    sqlWhere += ")";

    if (sqlWhere === "()") {
        sqlWhere = "";
    }

    return {associationUsed, from, sqlWhere};
}

/**
* return {where: "sql where clause", from: [list, of, table, needed], sqlTail: "order, skip, limit and such things usually put at end of sql query"}
*/
function sqlParse(_query, _baseTable, _options) {
    const table = _baseTable && global[_baseTable];
    const tableName = table && table.tableName || _baseTable;
    const parsedSql = {};
    const query = deepifyObject(_query);
    const parsedWhere = sqlParseWhere(query, _baseTable, _options);
    const parsedTail = sqlParseTail(query, _baseTable, _options);

    parsedSql.sqlTail = parsedTail.sqlTail;
    parsedSql.sqlWhere = parsedWhere.sqlWhere;
    parsedSql.from = arrayUnique(parsedWhere.from.concat(parsedTail.from));

    // Compute join from needed associations present only in tail,
    // must be added to the where clause if tail is added to query
    parsedSql.sqlTailJoin = "";
    parsedTail.associationUsed
        .filter((_association) => parsedWhere.associationUsed.includes(_association))
        .forEach((_association) => {
            // Association only used in tail, it means that it was not added to sqlWhere, we add it
            parsedSql.sqlTailJoin += ` AND \"${tableName}\".\"${_association.key}\"`
                + ` = \"${_association.model}\".id`;
        });

    parsedSql.getSqlFromList = () => {
        return `\"${parsedSql.from.join("\", \"")}\"`;
    };
    parsedSql.getSqlNoTail = ($selectStatement) => {
        return `SELECT ${$selectStatement} FROM ${parsedSql.getSqlFromList()} WHERE ${parsedSql.sqlWhere}`;
    };

    parsedSql.getSqlFull = ($selectStatement) => {
        let sql = `SELECT ${$selectStatement} FROM ${parsedSql.getSqlFromList()} WHERE `;

        if (parsedSql.sqlTailJoin) {
            sql += "(";
        }
        sql += parsedSql.sqlWhere;

        if (parsedSql.sqlTailJoin) {
            sql += `${parsedSql.sqlTailJoin})`;
        }

        sql += ` ${parsedSql.sqlTail}`;

        return sql;
    };

    return parsedSql;
}

module.exports = {
    sqlParse,
    sqlParseTail,
    sqlParseWhere
};
