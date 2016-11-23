"use strict";
const {populate} = require("./apiHelpers");

/**
 * Validate an object against a sails collection.
 * @param {object} _object a json object supposed to be an instance of _collection
 * @param {object} _collection a sails collection
 * @returns {Promise} a promise on the validation
 */
function validateObjectAgainstModel(_object, _collection) {
    return new Promise((resolve, reject) => {
        _collection.validate(_object, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(_object);
            }
        });
    });
}

/**
 * Return values only present in first array
 *
 * @param {any[]} _array The first array
 * @param {any[]} _array2 The second array
 * @returns {any[]} an array containing all values present in _array and not in _array2
 */
function valuesOnlyInFirst(_array, _array2) {
    return _array.filter((_val) => !_array2.includes(_val));
}

/**
 * Delete all association objects that ar enot usefull anymore
 * @param {object} _state the state data used for the association save
 * @returns {function} a callback ready to be used in a promise
 */
function deleteAssociations(_state) {
    return () => {
        const {associationTasks, id} = _state;

        const destroyers = associationTasks
            .filter(({idsToDelete}) => idsToDelete.length > 0)
            .map(({keyField, idsToDelete, association, collection}) => {
                const query = {
                    where: {
                        [keyField]: idsToDelete,
                        [association.via]: id
                    }
                };

                return collection.destroy(query);
            });

        return Promise.all(destroyers);
    };
}

/**
 * Create all association objects that need to be created
 * @param {object} _state the state data used for the association save
 * @returns {function} a callback ready to be used in a promise
 */
function saveAssociations(_state) {
    return () => {
        const {associationTasks} = _state;

        const savers = associationTasks.reduce((_savers, {objectsToCreate, collection}) => {
            const associationSavers = objectsToCreate.map(
                    (_associationObject) => collection.create(_associationObject)
                );

            return associationSavers.concat(_savers);
        }, []);

        return Promise.all(savers);
    };
}

/**
 * Set the good model Id to all the association objects so that they are ready to be saved
 * @param {object} _state the state data used for the association save
 * @returns {function} a callback ready to be used in a promise
 */
function setModelIdToAssociationObjects(_state) {
    return () => {
        const {savedModel} = _state;

        _state.associationTasks.forEach(({objectsToCreate, association}) => {
            objectsToCreate.forEach((_associationObject) => {
                _associationObject[association.via] = savedModel.id;
            });
        });
    };
}

/**
 * Update or create the main object and keep the saved object
 * @param {object} _state the state data used for the association save
 * @returns {function} a callback ready to be used in a promise
 */
function updateOrCreateModel(_state) {
    return () => {
        const {id, valueToSave, collection} = _state;
        let updateOrCreator;

        if (id === undefined || id === null) {
            updateOrCreator = collection.create(valueToSave);
        } else {
            updateOrCreator = collection
                                .update({id}, valueToSave)
                                .then((_savedModels) => _savedModels[0]);
        }

        return updateOrCreator
            .then((_savedModel) => {
                _state.savedModel = _savedModel;

                return _state;
            });
    };
}

/**
 * Validate association objects to be created against their corresponding waterline collection
 * @param {object} _state the state data used for the association save
 * @returns {function} a callback ready to be used in a promise
 */
function validateAssociationObjects(_state) {
    return () => {
        _state.valueToSave = _state.newValues;

        const validators = _state.associationTasks.map(({objectsToCreate, collection, association}) => {
            const associationValidators = objectsToCreate
                .map((_associationObject) => validateObjectAgainstModel(_associationObject, collection));

            delete _state.valueToSave[association.alias];

            return Promise.all(associationValidators).catch((_errors) => {
                const error = new Error(`Fail validating ${_state.collection.tableName} `
                    + `on ${collection.tableName} associations`);

                error.originalErrors = _errors;

                return Promise.fail(error);
            });
        });

        return Promise.all(validators);
    };
}

/**
 * Build the association objects to be created from the ids
 * @param {object} _state the state data used for the association save
 * @returns {function} a callback ready to be used in a promise
 */
function buildAssociationObjects(_state) {
    return () => {
        const {associationTasks, collection} = _state;

        associationTasks.forEach((_associationTask) => {
            const hasGetAssociationPopulateKey = typeof collection.getAssociationPopulateKey === "function";
            const associationPopulateKey = hasGetAssociationPopulateKey
                && collection.getAssociationPopulateKey();
            const {alias} = _associationTask.association;
            const keyField = associationPopulateKey && associationPopulateKey[alias];

            _associationTask.keyField = keyField;
            _associationTask.objectsToCreate = _associationTask.idsToCreate
                .map((_id) => ({
                    [_associationTask.association.via]: "-1",
                    [keyField]: _id
                }));
        });
    };
}

/**
 * Build a list of object to create and to destroy for each associations
 * @param {object} _state the state data used for the association save
 * @returns {function} a callback ready to be used in a promise
 */
function buildAssociationTasks(_state) {
    return () => {
        const {collection, newValues, oldValues} = _state;
        const {associations} = collection;

        _state.associationTasks = associations.map((_association) => {
            const {alias} = _association;
            const newIds = newValues[alias] || [];
            const oldIds = oldValues && oldValues.toJSON()[alias] || [];
            const idsToDelete = valuesOnlyInFirst(oldIds, newIds);
            const idsToCreate = valuesOnlyInFirst(newIds, oldIds);
            let associationCollection;

            if (typeof collection.getAssociationCollection === "function") {
                associationCollection = collection.getAssociationCollection(_association.collection);
            } else {
                const assocColName = _association.collection.charAt(0).toUpperCase()
                                + _association.collection.slice(1);

                associationCollection = global[assocColName];
            }

            return {
                association: _association,
                collection: associationCollection,
                idsToCreate,
                idsToDelete
            };
        });
    };
}

/**
 * Validate the given data against waterline collection definition
 * @param {object} _state the state data used for the association save
 * @returns {function} a callback ready to be used in a promise
 */
function validateMainData(_state) {
    return () => {
        const {oldValues, collection, newValues} = _state;
        const fullData = Object.assign({}, oldValues);

        Object.keys(newValues).forEach((_key) => {
            fullData[_key] = newValues[_key];
        });

        return validateObjectAgainstModel(fullData, collection);
    };
}

/**
 * Find the old data of the main object if we have the id
 * @param {object} _state the state data used for the association save
 * @returns {promise<void>} A promise on the task
 */
function findIfAble(_state) {
    const {id, collection} = _state;

    if (id !== undefined && id !== null) {

        return populate(collection.findOne({id}), collection)
            .then((_oldValues) => {
                _state.oldValues = _oldValues;
            });
    }

    return Promise.resolve();
}

/**
 * update or create the given model and update associations if any
 *
 * @param {object} _collection The collection
 * @param {object} _newValues The new values to save
 * @param {integer} [_updatedObjectId=null] The id of the object to update,
 * if null then an object will be created instead
 * @returns {promise<objetc>} a promise returning the saved model
 */
function saveModelAndAssociations(_collection, _newValues, _updatedObjectId = null) {
    const state = {
        collection: _collection,
        id: _updatedObjectId,
        newValues: _newValues
    };

    return findIfAble(state)
        .then(validateMainData(state))
        .then(buildAssociationTasks(state))
        .then(buildAssociationObjects(state))
        .then(validateAssociationObjects(state))
        .then(updateOrCreateModel(state))
        .then(setModelIdToAssociationObjects(state))
        .then(saveAssociations(state))
        .then(deleteAssociations(state))
        .then(() => populate(_collection.findOne({where: {id: state.savedModel.id}}), _collection));
}

module.exports = {saveModelAndAssociations};
