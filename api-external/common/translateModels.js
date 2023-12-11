"use strict";
const vm = require("vm");
const {StringDecoder} = require("string_decoder");
const {s3GetObject} = require("../../lib/amazonClient");
const amazonConfig = require("../../../config/amazoneAWS");

const decoder = new StringDecoder("utf8");
const translationDicts = {};

/**
 * Get the translations for all the requested languages
 *
 * @param {string[]} _languages array of language keys
 * @returns {object} the promise returning the translated model
 */
function getTranslationFiles(_languages) {
    const allPromises = _languages.map((_languageCode) => {
        const key = `public/common/sdf-i18n-${_languageCode}.js`;

        return new Promise((_resolve, _reject) => {
            s3GetObject("foodhub", amazonConfig.bucketVersioned, key, amazonConfig.amazoneClient.region)
                .then((_fileContent) => {
                    console.log("s3GetObject", key)
                    const context = {
                        define($deps, $fn) {
                            return $fn();
                        }
                    };
                    const stringContent = decoder.write(_fileContent.Body);
                    const translationDict = vm.runInNewContext(stringContent, context);

                    translationDicts[_languageCode] = translationDict;
                    _resolve();
                })
                .fail((_error) => {
                    translationDicts[_languageCode] = null;
                    _reject(_error);
                });
        });
    });

    return Promise.all(allPromises)
        .then(() => translationDicts);
}

/**
 * Try to translate model
 *
 * @param {object} _model Model to translate
 * @param {string} _keyToTranslate key of the value to translate
 * @param {object} _languageDicts language packs
 * @param {string} [_translationPrefix] The translation key prefix
 * @returns {object} the promise returning the translated model
 */
function translateModel(_model, _keyToTranslate, _languageDicts, _translationPrefix) {
    Object.keys(_languageDicts)
        .forEach((_languageKey) => {
            if (Array.isArray(_keyToTranslate)) {
                _keyToTranslate
                    .filter((_singleKeyToTranslate) => _model[_singleKeyToTranslate] !== null)
                    .forEach((_singleKeyToTranslate) => {
                        const valueToTranslate = _model[_singleKeyToTranslate];
                        const key = _translationPrefix ? `${_translationPrefix}${valueToTranslate}` : valueToTranslate;
                        const translation = _languageDicts[_languageKey][key];

                        _model[`${_singleKeyToTranslate}_${_languageKey}`] = translation || `MISSING TRANSLATION: ${key}`;
                    });
            } else {
                const valueToTranslate = _model[_keyToTranslate];
                const key = _translationPrefix ? `${_translationPrefix}${valueToTranslate}` : valueToTranslate;
                const translation = _languageDicts[_languageKey][key];

                _model[`name_${_languageKey}`] = translation || `MISSING TRANSLATION: ${key}`;
            }
        });
}

/**
 * Translate models if needed
 *
 * @param {object[]} _models List of models
 * @param {object} _collection waterline collection used for query
 * @returns {object} the promise returning the translated models
 */
function translateModels(_models, _collection) {
    const keyToTranslate = _collection.keyToTranslate;
    const translationPrefix = _collection.translationPrefix;
    let promise;

    if (keyToTranslate) {
        promise = getTranslationFiles(["fr", "en", "zh"])
            .then((_languagePacks) => {
                _models.forEach((_model) => translateModel(
                                                _model,
                                                keyToTranslate,
                                                _languagePacks,
                                                translationPrefix
                                            ));

                return _models;
            });
    } else {
        promise = Promise.resolve(_models);
    }

    return promise;
}

/**
 * Translate models if needed
 *
 * @param {object} _collection waterline collection used for query
 * @returns {object} the promise returning the translated models
 */
function translateModelsAsync(_collection) {
    return (_models) => {
        const isArray = Array.isArray(_models);

        return translateModels(isArray ? _models : [_models], _collection)
            .then((_results) => isArray ? _results : _results[0]);
    };
}

module.exports = {
    translateModels,
    translateModelsAsync,
    getTranslationFiles
};
