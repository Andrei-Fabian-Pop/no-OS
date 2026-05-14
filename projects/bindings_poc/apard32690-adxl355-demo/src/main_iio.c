/***************************************************************************//**
 *   @file   main_iio.c
 *   @brief  Main file for APARD32690 + ADXL355 IIO demo.
 *   @author Demo Project
********************************************************************************
 * Copyright 2024(c) Analog Devices, Inc.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Analog Devices, Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY ANALOG DEVICES, INC. "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL ANALOG DEVICES, INC. BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 * OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*******************************************************************************/

#include "common_data.h"
#include "iio_adxl355.h"
#include "iio_app.h"
#include "no_os_print_log.h"

#ifndef DATA_BUFFER_SIZE
#define DATA_BUFFER_SIZE 400
#endif

static uint8_t iio_data_buffer[DATA_BUFFER_SIZE * 3 * sizeof(int)];

/***************************************************************************//**
 * @brief Main function - initializes ADXL355 with IIO support.
 *
 * @return 0 on success, negative error code on failure.
 *         If working correctly, will execute continuously via iio_app_run
 *         and will not return.
*******************************************************************************/
int main(void)
{
	int ret;
	struct adxl355_iio_dev *adxl355_iio_desc;
	struct adxl355_iio_dev_init_param adxl355_iio_ip;
	struct iio_app_desc *app;
	struct iio_app_init_param app_init_param = { 0 };

	struct iio_data_buffer accel_buff = {
		.buff = (void *)iio_data_buffer,
		.size = DATA_BUFFER_SIZE * 3 * sizeof(int)
	};

	pr_info("APARD32690 + ADXL355 IIO Demo\n");
	pr_info("=============================\n");

	/* Assign SPI init params to ADXL355 init params */
	adxl355_ip.comm_init.spi_init = spi_ip;

	/* Initialize ADXL355 IIO device */
	adxl355_iio_ip.adxl355_dev_init = &adxl355_ip;
	ret = adxl355_iio_init(&adxl355_iio_desc, &adxl355_iio_ip);
	if (ret) {
		pr_info("ADXL355 IIO init failed: %d\n", ret);
		return ret;
	}

	pr_info("ADXL355 IIO initialized successfully\n");

	/* Configure IIO devices array */
	struct iio_app_device iio_devices[] = {
		{
			.name = "adxl355",
			.dev = adxl355_iio_desc,
			.dev_descriptor = adxl355_iio_desc->iio_dev,
			.read_buff = &accel_buff,
		}
	};

	/* Configure IIO application parameters */
	app_init_param.devices = iio_devices;
	app_init_param.nb_devices = NO_OS_ARRAY_SIZE(iio_devices);
	app_init_param.uart_init_params = uart_ip;

	/* Initialize IIO application */
	ret = iio_app_init(&app, app_init_param);
	if (ret) {
		pr_info("IIO app init failed: %d\n", ret);
		goto error_adxl355;
	}

	pr_info("IIO app initialized, starting IIO server...\n");

	/* Run IIO application (blocks forever handling IIO requests) */
	ret = iio_app_run(app);

	iio_app_remove(app);

error_adxl355:
	adxl355_iio_remove(adxl355_iio_desc);

	return ret;
}
