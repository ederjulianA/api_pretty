import { getProveedor, getProveedores } from "../models/proveedorModel.js";

export const getProveedorById = async (req, res) => {
  try {
    const { nit_ide } = req.params;

    if (!nit_ide) {
      return res.status(400).json({ error: "nit_ide es requerido" });
    }

    const proveedor = await getProveedor(nit_ide);
    res.json(proveedor);
  } catch (error) {
    console.error('Error al obtener proveedor:', error);

    if (error.message === "Proveedor no encontrado") {
      return res.status(404).json({ 
        error: "Proveedor no encontrado" 
      });
    }

    res.status(500).json({ 
      error: "Error al obtener el proveedor",
      details: error.message 
    });
  }
};

export const searchProveedores = async (req, res) => {
  try {
    const { 
      nit_ide, 
      nit_nom, 
      pageSize = 10, 
      pageNumber = 1 
    } = req.query;

    // Validar parámetros de paginación
    const parsedPageSize = parseInt(pageSize);
    const parsedPageNumber = parseInt(pageNumber);

    if (isNaN(parsedPageSize) || parsedPageSize <= 0) {
      return res.status(400).json({ error: "pageSize debe ser un número positivo" });
    }

    if (isNaN(parsedPageNumber) || parsedPageNumber <= 0) {
      return res.status(400).json({ error: "pageNumber debe ser un número positivo" });
    }

    const result = await getProveedores({ 
      nit_ide, 
      nit_nom, 
      pageSize: parsedPageSize, 
      pageNumber: parsedPageNumber 
    });

    res.json(result);
  } catch (error) {
    console.error('Error al buscar proveedores:', error);
    res.status(500).json({ 
      error: "Error al buscar proveedores",
      details: error.message 
    });
  }
}; 