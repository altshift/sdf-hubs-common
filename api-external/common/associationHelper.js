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
 * Extract from _newValues the values that needs to be created (because) they
 * are not in the _oldObjectValues
 * @param {Array} _oldObjectValues an array of sails object supposed to be an instance of _collection
 * @param {Array} _newValues an array of values sent by the client
 * @param {string} _valueFieldName the field name that contains the value in the associated object
 * @param {string} _viaFieldName the name of the reference that link the association value to its owner
 * @param {number} _ownerId the id of the item theses association are linked to
 * @returns {Array} an array of object that need to be added
 */
function extractAssocValuesToCreate(_oldObjectValues, _newValues, _valueFieldName, _viaFieldName, _ownerId) {
    let itemsToCreate,
        keyValuesBeforeUpdate;

    if (_newValues === undefined || _newValues.length === 0) {
        return [];
    } else if (_oldObjectValues === undefined || _oldObjectValues.length === 0) {
        itemsToCreate = _newValues;
    } else {
        keyValuesBeforeUpdate = _oldObjectValues.map((_value) => _value[_valueFieldName]);
        itemsToCreate = _newValues.filter((_value) => !keyValuesBeforeUpdate.includes(_value));
    }

    return itemsToCreate
        .map((_value) => {
            const itemToAdd = {};

            itemToAdd[_valueFieldName] = _value;
            itemToAdd[_viaFieldName] = _ownerId;

            return itemToAdd;
        });
}

function extractAssocIdToDelete(_oldObjectValues, _newValues, _valueFieldName) {
    return _oldObjectValues
        .filter((_value) => {
            const valueBeforeUpdate = _value[_valueFieldName];
            const valueNeedToBeRemoved = !_newValues || !_newValues.includes(valueBeforeUpdate);

            return valueNeedToBeRemoved;
        }).map((_value) => {
            return _value.id;
        });
}
/**
 * Update or create an object and its association base on a raw json object sent by the client and
 * the collection it belongs to.
 * @param {object} _collection a sails collection object describing the object being saved
 * @param {object} _dataToSave a plain json object sent by the client, describing the values needed
 * for creation or update
 * @param {Number} [_updatedObjectId] the id of the object being updated
 * @returns {Promise} return a promise containing the created or updated object
 */
function validateAndSaveAssociations(_collection, _dataToSave, _updatedObjectId = null) {
    const isCreate = _updatedObjectId === null; // else it's an update
    const {associations} = _collection;
    const associationPopulateKey = _collection.getAssociationPopulateKey();
    const findMainItemQuery = {where: {id: _updatedObjectId}};
    const allAssociationsUpdatePromise = [];
    const allObjectsToCreate = [];
    const mainItemFindPromise = _collection.findOne(_updatedObjectId);
    const mainItemCreatePromise = _collection.create(_dataToSave);
    const allAssociationValidationPromises = [];

    const associationBuildQueries = associations.map((_association) => {
        const {alias, via} = _association;
        const query = {where: {}};
        const expectedValuesAfterUpdate = _dataToSave[alias] && _dataToSave[alias].slice(); // duplicate the array

        if (expectedValuesAfterUpdate === undefined) {
            return undefined;
        }

        let assocColName = _association.collection.charAt(0).toUpperCase()
                            + _association.collection.slice(1);

        if (_collection.getPascalCollectionName) {
            assocColName = _collection.getPascalCollectionName(_association.collection);
        }
        const assocCollection = global[assocColName];

        query.where[via] = _updatedObjectId;

        return assocCollection
            .find(query)
            .then((_prevValues) => {
                // association field used for the values
                const keyField = associationPopulateKey[alias];
                const idToDelete = extractAssocIdToDelete(_prevValues, expectedValuesAfterUpdate, keyField);

                allAssociationsUpdatePromise.push(assocCollection.destroy(idToDelete));


                extractAssocValuesToCreate(_prevValues, expectedValuesAfterUpdate, keyField, via, _updatedObjectId)
                    .forEach((_itemToAdd) => {
                        // TODO validate also during the create to ensure a pseudo transaction before creating objects
                        if (!isCreate) {
                            allAssociationValidationPromises
                                .push(validateObjectAgainstModel(_itemToAdd, assocCollection));
                        }
                        allObjectsToCreate.push({
                            collection: assocCollection,
                            item: _itemToAdd,
                            via
                        });
                    });
            });
    }).filter((_value) => _value !== undefined);

    if (isCreate) {
        return Promise.all(associationBuildQueries)
            .then(() => validateObjectAgainstModel(_dataToSave, _collection))
            .then(() => mainItemCreatePromise)
            .then(({id}) => {
                // now that we have the id, we can link the assoc object back to its owner
                allObjectsToCreate.forEach(({collection, item, via}) => {
                    item[via] = id;
                    allAssociationsUpdatePromise.push(collection.create(item));
                });

                return Promise
                    .all(allAssociationsUpdatePromise)
                    .then(() => id);
            })
            .then((_id) => populate(_collection.findOne(_id), _collection));
    } else {
        return Promise.all(associationBuildQueries)
            .then(() => Promise.all(allAssociationValidationPromises))
            .then(() => mainItemFindPromise)
            .then((_foundItem) => {
                // construct a proper item (all fields with a value) so we can validate it
                Object
                    .keys(_dataToSave)
                    .forEach((_key) => {
                        if (Array.isArray(_dataToSave[_key])) {
                            _foundItem[_key] = _dataToSave[_key].splice();
                        } else {
                            _foundItem[_key] = _dataToSave[_key];
                        }
                    });

                return validateObjectAgainstModel(_foundItem, _collection);
            })
            .then(() => {
                allObjectsToCreate.forEach(({collection, item}) => {
                    allAssociationsUpdatePromise.push(collection.create(item));
                });

                return Promise.all(allAssociationsUpdatePromise);
            })
            .then(() => {
                const assocNameList = associations.map(({alias}) => alias);

                // clean object of all assoc field
                Object
                    .keys(_dataToSave)
                    .forEach((_key) => {
                        if (assocNameList.includes(_key)) {
                            delete _dataToSave[_key];
                        }
                    });

                return _collection.update(findMainItemQuery, _dataToSave);
            })
            .then(() => populate(_collection.findOne(_updatedObjectId), _collection));
    }
}
module.exports = {
    extractAssocIdToDelete,
    extractAssocValuesToCreate,
    validateAndSaveAssociations
};
