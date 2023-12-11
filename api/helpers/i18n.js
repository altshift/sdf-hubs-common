/**
 * helper to handle translation server side
 *
 * @name i18n
 *
 */
"use strict";

const {s3GetObject} = require("../../lib/amazonClient");
const StringDecoder = require("string_decoder").StringDecoder;
const decoder = new StringDecoder("utf8");

const i18n = {
    allLoadedDict: {},
    currentLanguage: "",
    dictionnary: {},

    setupAmazon(_amazoneConfig, app) {
        this.amazoneConfig = _amazoneConfig;
        this.app = app;

        return this;
    },

    translate(_key, _params) {
        const isProdDb = global.sails.config.connections.isProdDb;
        if (!isProdDb) {
            const recetteKey = "recette." + _key;
            if (i18n.exists(recetteKey)) {
                _key = recetteKey;
            }
        }

        let translation = this.dictionnary[_key];

        if (translation) {
            if (_params) {
                translation = Object.keys(_params).reduce((_translation, _paramKey) => {
                    return _translation.replace(`{{${_paramKey}}}`, _params[_paramKey]);
                }, translation);
            }
        } else {
            translation = `MISSING TRANSLATION FOR KEY: ${_key}`;
        }

        return translation;
    },

    exists(_key) {
        return Boolean(this.dictionnary[_key]);
    },

    pSetLanguage(_language = "fr", _forceReload) {
        return new Promise((_resolve, _reject) => {
            this.currentLanguage = _language;

            if (_forceReload || !this.allLoadedDict[_language]) {
                const pDict = this.pGetFileContentForLanguage(_language);

                pDict
                    .then(($dictionary) => {
                        this.setLanguageDict(_language, $dictionary);
                        this.dictionnary = $dictionary;
                    })
                    .then(_resolve, _reject);
            } else {
                // Already loaded, switch current dictionary only
                this.dictionnary = this.allLoadedDict[_language];
                _resolve();
            }
        });
    },

    // Set dictionnary for language
    setLanguageDict(_language, _dict) {
        this.allLoadedDict[_language] = _dict;
    },

    pGetFileContentForLanguage($language) {
        return new Promise((_resolve, _reject) => {
            const params = {
                Bucket: String(this.amazoneConfig.bucketVersioned),
                Key: `public/common/sdf-i18n-${$language}.js`
            };

            s3GetObject(this.app, params.Bucket, params.Key, this.amazoneConfig.amazoneClient.region)
            .then((_fileContent) => {
                let dict = null;

                (function isolator() {
                    function define(_deps, _fn) {
                        return _fn();
                    }

                    dict = eval(decoder.write(_fileContent)) || {};
                })();

                _resolve(dict);
            })
            .fail(function (_error) {
                _reject(_error);
            });
        });
    },

    getFileNameForLanguage($language) {
        return `sdf-i18n-${$language || "fr"}.js`;
    }
};

module.exports = i18n;
