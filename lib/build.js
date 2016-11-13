/* eslint-disable no-console */
"use strict";
const babel = require("babel-core");
const path = require("path");
const fs = require("fs");
const requirejs = require("requirejs");
const {exec} = require("child_process");

/*
function pHbsCompile($dirPath) {
    var deferred = Q.defer();

    // Look in given directory
    fs.readdir($dirPath, function ($err, $dirContent) {
        var allFilePromises = [];
        if ($err) {
            deferred.reject($err);
            return;
        }

        // Browse all file/dir inside given directory
        $dirContent.forEach(function ($name) {
            var outputPath, path,
                fileDeferred = Q.defer();

            allFilePromises.push(fileDeferred.promise);

            // Build paths
            path = $dirPath + "/" + $name + "/" + $name + "_template.hbs";
            outputPath = path.replace(".hbs", ".html.js");

            // Check template existence
            fs.exists(path, function ($exists) {
                if ($exists) {
                    process.stdout.write("-");
                    // Template exists, call compilation on it
                    exec(__dirname + "/node_modules/handlebars/bin/handlebars " + path + " --extension hbs -f " + outputPath, function ($err) {
                        if ($err) {
                            process.stdout.write("!");
                            // Error during compilation, delete compiled template if any
                            fs.exists(outputPath, function ($exists) {
                                if ($exists) {
                                    fs.unlink(outputPath, function () {
                                        fileDeferred.reject(new Error(">> Hbs template compilation failed for Widget " + $name + ". Built file deleted.\n" + $err));
                                    });
                                } else {
                                    fileDeferred.reject(new Error(">> Hbs template compilation failed for Widget " + $name + "\n" + $err));
                                }
                            });
                        } else {
                            process.stdout.write(".");
                            fileDeferred.resolve({
                                path: path,
                                status: "compiled"
                            });
                        }
                    });
                } else {
                    // Template do not exists, delete compiled template if any
                    fs.exists(outputPath, function ($exists) {
                        if ($exists) {
                            fs.unlink(outputPath, function () {
                                fileDeferred.resolve({
                                    status: "nothing to compile",
                                    compiledFile: "deleted"
                                });
                            });
                        } else {
                            fileDeferred.resolve({
                                status: "nothing to compile"
                            });
                        }
                    });
                    fileDeferred.resolve({
                        status: "nothing to compile"
                    });
                }
            });

            // Resolve promise once all hbs files have been compiled
            Q.all(allFilePromises).then(function () {
                deferred.resolve();
            }, function ($err) {
                deferred.reject($err);
            });
        });
    });

    return deferred.promise;
}
*/

/**
 * @param {object} _config requirejs config for build
 * @param {object[]} _config.modules List of modules to compile
 * @param {object[]} _config.dir path of the files
 * @returns {promise<void>} a promise for the process
 */
function babelify({modules, dir}) {
    const startAt = Date.now();

    console.log("##############################");
    console.log("#### Starting to babelify ####");
    const allBabelifiers = modules
        .filter(({_babelify}) => typeof _babelify !== "boolean" || _babelify)
        .map(({name}) => {
            return new Promise((_resolve, _reject) => {
                const fileDirPath = dir;
                const filePath = `${path.join(fileDirPath, name)}.js`;

                babel.transformFile(filePath, {presets: ["es2016"]}, (_error, _babelified) => {
                    const outPath = `${path.join(fileDirPath, name)}.bab.js`;

                    if (_error) {
                        _reject(_error);
                    } else {
                        fs.writeFile(outPath, _babelified.code, (_errorWrite) => {
                            if (_errorWrite) {
                                return _reject(_errorWrite);
                            } else {
                                return _resolve(filePath);
                            }
                        });
                    }
                });
            }).then((_filePath) => {
                console.log(`## ${_filePath} babelified.`);
            });
        });

    return Promise.all(allBabelifiers).then(() => {
        const duration = (Date.now() - startAt) / 1000;

        console.log(`#### Babelify ended in ${duration}s ####`);
        console.log("########################################");
    });
}

/**
 * @param {object} _config requirejs config for build
 * @returns {promise<void>} a promise for the process
 */
function requireJsOptimize(_config) {
    return new Promise((_resolve) => {
        requirejs.optimize(_config, _resolve);
    });
}

/**
 * @param {object} _config requirejs config for build
 * @param {string} _packageJsonPath package.json path
 * @returns {promise<void>} a promise for the process
 */
function requireJsPackager(_config, _packageJsonPath) {
    return new Promise((_resolve, _reject) => {
        const packageFilePath = `${_packageJsonPath}/package.json`;

        // Read version in package.json
        fs.readFile(packageFilePath, (_error, _content) => {
            if (_error) {
                return _reject(_error);
            }

            const projectConfig = JSON.parse(_content);
            let {version} = projectConfig;

            // Remove previous build
            exec(`rm -rf ${__dirname}/assets/_build/*`, () => {
                const tabSize = 4;

                let packageStr;

                // Increase version
                version = version.split("-r");
                version[1] = parseInt(version[1] || "0", 10) + 1;
                version = version.join("-r");
                projectConfig.version = version;

                // Save new version number in projectConfig
                packageStr = JSON.stringify(projectConfig, null, tabSize); // eslint-disable-line prefer-const
                fs.writeFile(packageFilePath, packageStr, (_errorWrite) => {
                    if (_errorWrite) {
                        return _reject(_errorWrite);
                    } else {
                        _config.dir += `/${version}`;

                        return requireJsOptimize(_config).then(_resolve, _reject);
                    }
                });
            });
        });
    });
}

/**
 * @param {object} _config requirejs config for build
 * @param {string} _packageJsonPath package.json path
 * @returns {promise<void>} a promise for the process
 */
function build(_config, _packageJsonPath) {
    return requireJsPackager(_config, _packageJsonPath)
        .then(() => {
            return babelify(_config);
        });
}

module.exports = {build};
