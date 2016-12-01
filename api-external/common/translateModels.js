"use strict";
const vm = require("vm");
const {StringDecoder} = require("string_decoder");

const decoder = new StringDecoder("utf8");
const translationDicts = {};

/**
 * Get the translations for all the languages
 *
 * @param {object} _amazonS3Client Amazon s3 Client
 * @param {object} _amazonBucket Amazon s3 Vucket where to find the translation files
 * @param {string[]} _languages array of language keys
 * @returns {object} the promise returning the translated model
 */
function getTranslationFiles(_amazonS3Client, _amazonBucket, _languages) {
    const allPromises = _languages.map((_languageCode) => {
        const params = {
            Bucket: String(_amazonBucket),
            Key: `public/common/sdf-i18n-${_languageCode}.js`
        };

        return new Promise((_resolve, _reject) => {
            _amazonS3Client.getObject(params, (_error, _fileContent) => {
                if (_error) {
                    translationDicts[_languageCode] = null;
                    _reject(_error);
                } else {
                    const context = {
                        define($deps, $fn) {
                            return $fn();
                        }
                    };
                    const stringContent = decoder.write(_fileContent.Body);
                    const translationDict = vm.runInNewContext(stringContent, context);

                    translationDicts[_languageCode] = translationDict;
                    _resolve();
                }
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
 * @param {string} _keyToTranslate key of the valud to translate
 * @param {object} _languageDicts language packs
 * @param {string} [_translationPrefix] The translation key prefix
 * @returns {object} the promise returning the translated model
 */
function translateModel(_model, _keyToTranslate, _languageDicts, _translationPrefix) {
    Object.keys(_languageDicts)
        .forEach((_languageKey) => {
            const valueToTranslate = _model[_keyToTranslate];
            const key = _translationPrefix ? `${_translationPrefix}${valueToTranslate}` : valueToTranslate;
            const translation = _languageDicts[_languageKey][key];

            _model[`name_${_languageKey}`] = translation || `MISSING TRANSLATION: ${key}`;
        });
}

/**
 * Translate models if needed
 *
 * @param {object[]} _models List of models
 * @param {object} _collection waterline collection used for query
 * @param {object} _amazonS3Client Amazon s3 Client
 * @param {object} _amazonBucket Amazon s3 Bucket where to find the translation files
 * @returns {object} the promise returning the translated models
 */
function translateModels(_models, _collection, _amazonS3Client, _amazonBucket) {
    const keyToTranslate = _collection.keyToTranslate;
    const translationPrefix = _collection.translationPrefix;
    let promise;

    if (keyToTranslate) {
        promise = getTranslationFiles(_amazonS3Client, _amazonBucket, ["fr", "en", "zh"])
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
 * @param {object} _amazonS3Client Amazon s3 Client
 * @param {object} _amazonBucket Amazon s3 Vucket where to find the translation files
 * @returns {object} the promise returning the translated models
 */
function translateModelsAsync(_collection, _amazonS3Client, _amazonBucket) {
    return (_models) => {
        const isArray = Array.isArray(_models);

        return translateModels(isArray ? _models : [_models], _collection, _amazonS3Client, _amazonBucket)
            .then((_results) => isArray ? _results : _results[0]);
    };
}

module.exports = {
    translateModels,
    translateModelsAsync
};
