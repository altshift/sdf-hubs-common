"use strict";

const r_Bcrypt = require("bcrypt");

const {error403, handleErrorAsync} = require("../common/clientError/errorDefinitions");

/**
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function checkPasswordpostRoute(_request, _response, _next) {
    const credentials = _request.swagger.params.credentials.value;
    const login = credentials.login;
    const password = credentials.password;
    const findAccounPromise = global.Account.findOne({where: {login}});

    const validatePasswordPromise = findAccounPromise.then((_account) => {
        return new Promise((_resolve, _reject) => {
            if (_account) {
                const allowedGroup = [
                    "producer",
                    "buyer"
                ];

                if (allowedGroup.includes(_account.group)) {
                    const apiPath = _request.swagger.apiPath;
                    const url = _request.getFullUrl();
                    const groupUrlPart = `${_account.group}s`;
                    const regex = new RegExp(`${apiPath}`);
                    const userUrl = url.replace(regex, `/${groupUrlPart}/${_account.id}`);

                    r_Bcrypt.compare(password, _account.password, (_bCryptError, _match) => {
                        if (_bCryptError) {
                            _reject(new Error(_bCryptError));
                        } else if (_match) {
                            const answer = {
                                group: _account.group,
                                id: _account.id,
                                status: "match"
                            };

                            if (_account.group === "producer") {
                                answer.link = userUrl;
                            }

                            _resolve(answer);
                        } else {
                            _resolve({status: "invalid"});
                        }
                    });
                } else {
                    const errorMsg = "The login belongs to an account "
                        + "which you are not allowed to connect to";

                    _reject(error403(errorMsg));
                }
            } else {
                _resolve({status: "not-found"});
            }
        });
    });

    validatePasswordPromise
        .then((_result) => {
            _response.send(_result);
        })
        .catch(handleErrorAsync(_next));
}

module.exports = {checkPasswordpostRoute};
