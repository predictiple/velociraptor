import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Container from  'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import InputGroup from 'react-bootstrap/InputGroup';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from "classnames";
import api from '../core/api-service.jsx';
import {CancelToken} from 'axios';
import T from '../i8n/i8n.jsx';
import Alert from 'react-bootstrap/Alert';
import ToolTip from '../widgets/tooltip.jsx';
import VeloTable from '../core/table.jsx';

import "./artifacts-upload.css";


export default class ArtifactsUpload extends React.Component {
    static propTypes = {
        onClose: PropTypes.func.isRequired,
    };

    state = {
        pack_file: null,
        prefix: "",
        loading: false,
        uploaded: [],
        filter: "",

        // after upload the server will cache the file here.
        vfs_path: [],
        errors: [],
    }

    componentDidMount() {
        this.source = CancelToken.source();
    }

    componentWillUnmount() {
        this.source.cancel("unmounted");
    }

    componentDidUpdate = (prevProps, prevState, rootNode) => {
        if(!_.isEqual(prevState.filter, this.state.filter) ||
           !_.isEqual(prevState.prefix, this.state.prefix) ||
           !_.isEqual(prevState.vfs_path, this.state.vfs_path)) {
            this.updateFile();
            return true;
        }
        return false;
    }

    // The first call uploads the file and records the cached
    // filestore path
    uploadFile = () => {
        if (!this.state.pack_file) {
            return;
        }

        var reader = new FileReader();
        reader.onload = (event) => {
            var request = {
                prefix: this.state.prefix,
                filter: this.state.filter,
                data: reader.result.split(",")[1],
            };

            this.setState({loading: true});
            api.post("v1/LoadArtifactPack", request,
                     this.source.token).then(response => {
                         if (response.data.cancel) {
                             return ;
                         }

                         let uploaded = _.map(
                             response.data.successful_artifacts,
                             (x, idx)=>{
                                 return {name: x, id: idx};
                             });
                         this.setState({loading:false,
                                        current_error: undefined,
                                        errors: response.data.errors || [],
                                        vfs_path: response.data.vfs_path,
                                        uploaded: uploaded});
                     }).catch(err=>{
                         let data = err.response &&
                             err.response.data && err.response.data.message;
                         this.setState({current_error: data,
                                        loading:false,
                                        pack_file: undefined});
                     });
        };
        reader.readAsDataURL(this.state.pack_file);
    }

    updateFile = () => {
        if (this.state.loading) {
            return;
        }

        var request = {
            prefix: this.state.prefix,
            filter: this.state.filter,
            vfs_path: this.state.vfs_path,
        };
        api.post("v1/LoadArtifactPack", request,
                 this.source.token).then(response => {
                     if (response.data.cancel) {
                         return ;
                     }
                     let uploaded = _.map(
                         response.data.successful_artifacts,
                         (x, idx)=>{
                             return {name: x, id: idx};
                         });

                     this.setState({loading:false,
                                    vfs_path: response.data.vfs_path,
                                    uploaded: uploaded});
                 });
    };

    importFile = () => {
        var request = {
            prefix: this.state.prefix,
            filter: this.state.filter,
            vfs_path: this.state.vfs_path,
            really_do_it: true,
        };
        api.post("v1/LoadArtifactPack", request,
                 this.source.token).then(response => {
                     if (response.data.cancel) {
                         return ;
                     }
                     this.props.onClose();
                 });
    };

    render() {
        let headers = {
            name: T("Artifact Name"),
        };

        return (
            <>
              <Modal show={true}
                     dialogClassName="modal-90w"
                     onHide={this.props.onClose}>
                <Modal.Header closeButton>
                  <Modal.Title>{T("Upload artifacts from a Zip pack")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <Form className="selectable">
                    <Form.Group as={Row}>
                      <Col sm="12">
                        <InputGroup className="full-width custom-file-button">
                          <Button variant="default"
                            className={classNames({"disabled": !this.state.pack_file})}
                            onClick={()=>this.uploadFile()}>
                            { this.state.loading ?
                              <FontAwesomeIcon icon="spinner" spin/> :
                              T("Click to Upload") }
                          </Button>
                          <Form.Control type="file" id="upload"
                                        onChange={e => {
                                            if (!_.isEmpty(e.currentTarget.files)) {
                                                this.setState({pack_file: e.currentTarget.files[0]});
                                            }
                                        }}
                          />
                          <ToolTip tooltip={T("Select artifact pack (Zip file with YAML definitions)")}>
                            <Button variant="default-outline"
                                    className="flush-right">
                              <Form.Label data-browse="Select file" htmlFor="upload">
                                {this.state.pack_file ? this.state.pack_file.name :
                                 T("Select artifact pack (Zip file with YAML definitions)")}
                              </Form.Label>
                            </Button>
                          </ToolTip>

                        </InputGroup>
                        { this.state.current_error &&
                          <Alert variant="danger" className="text-center">
                            {this.state.current_error}
                          </Alert> }
                      </Col>
                    </Form.Group>
                  </Form>

                  { !_.isEmpty(this.state.vfs_path) &&
                    <Form>
                      <Form.Group as={Row}>
                        <Form.Label column sm="3">{T("Prefix")}</Form.Label>
                        <Col sm="8">
                          <Form.Control as="input" rows={3}
                                        placeholder={T("Append prefix to all artifact names")}
                                        spellCheck="false"
                                        value={this.state.prefix}
                                        onChange={e => {
                                            this.setState({prefix: e.target.value});
                                        }}
                          />
                        </Col>
                      </Form.Group>
                      <Form.Group as={Row}>
                        <Form.Label column sm="3">{T("Filter")}</Form.Label>
                        <Col sm="8">
                          <Form.Control as="input"
                                        placeholder={T("Filter name of artifacts to load")}
                                        spellCheck="false"
                                        value={this.state.filter}
                                        onChange={e => {
                                            this.setState({filter: e.target.value});
                                        }}
                          />
                        </Col>
                      </Form.Group>

                      <VeloTable
                        rows={this.state.uploaded}
                        columns={["name"]}
                        header_renderers={headers}
                        no_toolbar={true}
                      />
                    </Form> }

                  { this.state.errors.length > 0 &&
                    <Container className="artifact-import-errors">
                      <Alert variant="danger">
                        {T("Errors")}
                      </Alert>
                      <Alert variant="warning">
                        <dl className="row" >
                          {_.map(this.state.errors, (msg, idx) => {
                              return <React.Fragment key={idx}>
                                       <dt className="col-4">{msg.filename}</dt>
                                       <dd className="col-8">
                                         <div className="error-message">{msg.error}</div>
                                       </dd>
                                     </React.Fragment>;
                          })}
                        </dl>
                      </Alert>
                  </Container>}

                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" onClick={this.props.onClose}>
                    {T("Cancel")}
                  </Button>
                <Button variant="secondary"
                        disabled={_.isEmpty(this.state.uploaded)}
                        onClick={()=>this.importFile()}>
                  {T("Import Artifacts", this.state.uploaded && this.state.uploaded.length)}
                </Button>
              </Modal.Footer>
            </Modal>
            </>
        );
    }
};
