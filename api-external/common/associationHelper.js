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
                resolve();
            }
        });
    });
}

function extractAssocValuesToCreate(_oldObjectValues, _newValues, _valueFieldName, _viaFieldName, _viaId) {
    let keyValuesBeforeUpdate;
    let itemsToCreate;

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
            itemToAdd[_viaFieldName] = _viaId;

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

function validateAndSaveAssociations(_collection, _dataToSave, _idTosave = null) {
    const isCreate = _idTosave === null; // else it's an update
    const {associations} = _collection;
    const associationPopulateKey = _collection.getAssociationPopulateKey();
    const findMainItemQuery = {where: {id: _idTosave}};
    const allAssociationsUpdatePromise = [];
    const allObjectsToCreate = [];
    const mainItemFindPromise = _collection.findOne(_idTosave);
    const mainItemCreatePromise = _collection.create(_dataToSave);
    const allAssociationValidationPromises = [];

    const associationBuildQueries = associations.map((_association) => {
        const {alias, via} = _association;
        const query = {where: {}};
        const assocColName = _association.collection.charAt(0).toUpperCase()
                            + _association.collection.slice(1);
        const assocCollection = global[assocColName];

        query.where[via] = _idTosave;

        return assocCollection
            .find(query)
            .then((_prevValues) => {
                // association field used for the values
                const keyField = associationPopulateKey[alias];
                const expectedValuesAfterUpdate = _dataToSave[alias].slice(); // duplicate the array
                const idToDelete = extractAssocIdToDelete(_prevValues, expectedValuesAfterUpdate, keyField);

                allAssociationsUpdatePromise.push(assocCollection.destroy(idToDelete));

                extractAssocValuesToCreate(_prevValues, expectedValuesAfterUpdate, keyField, via, _idTosave)
                .forEach((_itemToAdd) => {
                    allAssociationValidationPromises.push(validateObjectAgainstModel(_itemToAdd, assocCollection));
                    allObjectsToCreate.push({
                        collection: assocCollection,
                        item: _itemToAdd,
                        via
                    });
                });
            });
    });

    if (isCreate) {
        return Promise.all(associationBuildQueries)
            .then(() => validateObjectAgainstModel(_dataToSave, _collection))
            .then(() => mainItemCreatePromise)
            .then((_createdItem) => {
                allObjectsToCreate.forEach(({collection, item, via}) => {
                    item[via] = _createdItem.id;
                    allAssociationsUpdatePromise.push(collection.create(item));
                });
            })
            .then((_createdItem) => _createdItem);
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
            .then(() => populate(_collection.findOne(_idTosave), _collection))
            .then((_updatedItems) => _updatedItems);
    }
}
module.exports = {
    extractAssocIdToDelete,
    extractAssocValuesToCreate,
    validateAndSaveAssociations
};
