/**
 * helper to handle translation server side
 *
 * @name i18n
 *
 */
"use strict";

const rAmazoneClient = require("aws-sdk");
const StringDecoder = require("string_decoder").StringDecoder;
const decoder = new StringDecoder("utf8");

const i18n = {
    allLoadedDict: {},
    currentLanguage: "",
    dictionnary: {},


    setupAmazon(_amazoneConfig) {
        this.amazoneConfig = _amazoneConfig;
        rAmazoneClient.config.update(_amazoneConfig.amazoneClient);
        this.s3Client = new rAmazoneClient.S3();

        return this;
    },

    translate(_key, _params) {
        let translation = this.dictionnary[_key];

        if (translation) {
            if (_params) {
                Object.keys(_params).reduce((_translation, _paramKey) => {
                    return translation.replace(`{{${_paramKey}}}`, _params[_paramKey]);
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
            if (_forceReload || !this.allLoadedDict[_language]) {
                const pDict = this.pGetFileContentForLanguage(_language);

                this.currentLanguage = _language;

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

            this.s3Client.getObject(params, (_error, _fileContent) => {
                if (_error) {
                    _reject(_error);
                } else {
                    let dict = null;

                    (function() {
                        function define(_deps, _fn) {
                            return _fn();
                        }

                        dict = eval(decoder.write(_fileContent.Body));
                    })();

                    _resolve(dict);
                }
            });
        });
    },

    getFileNameForLanguage($language) {
        return `sdf-i18n-${$language || "fr"}.js`;
    }
};

module.exports = i18n;
